/// Cross-implementation parity smoke. Run alongside:
///   pnpm tsx scripts/smoke-python-parity.ts
///   cd packages/python-sdk && python test_parity.py
///
/// All three must produce IDENTICAL hex strings. The values printed
/// below are also locked in unit tests (kernel.rs::parity_direct_send_golden,
/// capability_hash.rs::parity_translate_demo_settle).

use settle_sdk::{
    capability_hash::Capability, compute_capability_hash_hex, kernel_commit,
    kernel::{Decision, ReceiptKind},
    KernelCommitInput,
};

fn main() {
    let result = kernel_commit(&KernelCommitInput {
        kind: ReceiptKind::DirectSend,
        request_id: "11111111-2222-3333-4444-555555555555".into(),
        amount_lamports: "500000".into(),
        sender: "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp".into(),
        recipient: "C9HAssvFBtEgHvZRVGdfxcUwrGfu5iK4Z3FKn52Ns7yY".into(),
        decision_slot: 1000,
        purpose_text: "coffee with alice".into(),
        decision: Decision::Allow,
        deny_code: 0,
        card: None,
        http: None,
    });

    println!("kind:                 {}", result.kind.as_str());
    println!("receipt_hash:         {}", result.hashes.receipt_hash);
    println!("reason_hash:          {}", result.hashes.reason_hash);
    println!("policy_snapshot_hash: {}", result.hashes.policy_snapshot_hash);
    println!("purpose_hash:         {}", result.hashes.purpose_hash);
    println!("context_hash:         {}", result.context_hash);

    let cap = compute_capability_hash_hex(&Capability {
        domain: "translate.demo.settle",
        method: "POST",
        path: "/v1/translate",
        amount_lamports: "20000",
        version: 1,
    });
    println!();
    println!("Translate cap hash:   {}", cap);
}
