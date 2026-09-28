import { rpc } from "double-ou-rien-client";
const s = new rpc.Server("https://soroban-testnet.stellar.org");
for (const h of process.argv.slice(2)) {
const r = await s.getTransaction(h);
const tr = r.resultXdr.result().results?.()?.[0]?.tr?.();
const sd = r.envelopeXdr.v1().tx().ext().sorobanData(); const rs = sd.resources();
console.log(h.slice(0,8), r.status, tr?.value()?.switch?.()?.name, "instr", rs.instructions(), "read", rs.diskReadBytes(), "write", rs.writeBytes(), "resFee", sd.resourceFee().toString());
const fp = rs.footprint();
for (const [n,l] of [["rw",fp.readWrite()],["ro",fp.readOnly()]]) console.log(" ", n, l.map(k => k.switch().name==="contractData" ? (()=>{const key=k.contractData().key(); return key.switch().name==="scvVec" ? "vec:"+key.vec()[0].sym().toString() : key.switch().name})() : k.switch().name).join(", "));
}
