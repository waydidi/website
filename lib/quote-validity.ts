export const TRANSFER_QUOTE_MS=30*60*1000;
export function validTransferQuote(quote:{createdAt:string;expiresAt:string},now=Date.now()) {
 const created=Date.parse(quote.createdAt),expires=Date.parse(quote.expiresAt);
 return Number.isFinite(created)&&created<=now+1000&&now<Math.min(expires,created+TRANSFER_QUOTE_MS);
}
