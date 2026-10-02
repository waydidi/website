export type PartnerRole = "admin" | "booker" | "finance" | "viewer";
export const canBook = (role:PartnerRole) => role === "admin" || role === "booker";
export const canFinance = (role:PartnerRole) => role === "admin" || role === "finance";
export const thb = (minor:number) => new Intl.NumberFormat("en-GB",{style:"currency",currency:"THB"}).format(minor/100);
export const thaiToday = () => new Date(Date.now()+7*3600000).toISOString().slice(0,10);
