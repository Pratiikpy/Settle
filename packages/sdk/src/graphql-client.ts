/**
 * F5.10 — GraphQL client helper.
 *
 * Thin wrapper around fetch — we deliberately don't depend on
 * `graphql-request` / `urql` / `apollo-client` because:
 *   1. The full clients add 30-200KB to bundle, which we don't need
 *      for a read-only API.
 *   2. They want to manage caching/optimistic updates, which is
 *      counter-productive for receipts (server-of-record is on-chain;
 *      the cache should be deferred to the consumer).
 *
 * Usage:
 *   const client = createGraphqlClient("https://settle.app/api/graphql");
 *   const data = await client<{ receipt: Receipt | null }>(
 *     "query Q($id: ID!) { receipt(request_id: $id) { request_id amount_lamports } }",
 *     { id: "..." },
 *   );
 */

export interface GraphqlError {
  message: string;
  path?: ReadonlyArray<string | number>;
  extensions?: Record<string, unknown>;
}

export interface GraphqlResult<T> {
  data?: T;
  errors?: GraphqlError[];
}

export type GraphqlClient = <T>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<T>;

/**
 * Build a typed GraphQL client. Throws on transport errors AND on the
 * presence of any `errors[]` in the response (wrapped as a single
 * Error whose `.message` aggregates all error messages).
 */
export function createGraphqlClient(
  endpoint: string,
  options: { fetchImpl?: typeof fetch; headers?: Record<string, string> } = {},
): GraphqlClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new Error(`graphql_transport_${res.status}: ${await res.text().catch(() => "")}`);
    }
    const json = (await res.json()) as GraphqlResult<T>;
    if (json.errors && json.errors.length > 0) {
      throw new Error(`graphql_errors: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    if (json.data === undefined) {
      throw new Error("graphql_no_data");
    }
    return json.data;
  };
}
