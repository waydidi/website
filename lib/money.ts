/** Canonical THB ledger unit: integer satang. Major amounts are UI/legacy boundaries only. */
export function toSatang(baht:number) {
 if(!Number.isFinite(baht)||baht<0) throw new Error("INVALID_MONEY");
 const minor=Math.round(baht*100);
 if(!Number.isSafeInteger(minor)||Math.abs(baht*100-minor)>0.000001) throw new Error("INVALID_MONEY_PRECISION");
 return minor;
}
export function assertSatang(minor:number) {if(!Number.isSafeInteger(minor)||minor<0) throw new Error("INVALID_SATANG");return minor;}
