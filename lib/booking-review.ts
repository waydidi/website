export type ReviewFieldErrors = Partial<
  Record<"name" | "surname" | "email" | "phone" | "termsAccepted" | "taxName" | "taxId" | "taxAddress", string>
>;

export function validateBookingReview(input: {
  name: string;
  surname: string;
  email: string;
  phone: string;
  termsAccepted: boolean;
  taxInvoice?: boolean;
  taxName?: string;
  taxId?: string;
  taxAddress?: string;
}) {
  const errors: ReviewFieldErrors = {};
  if (input.name.trim().length < 2) errors.name = "Enter the lead passenger’s full name.";
  if (input.surname.trim().length < 1) errors.surname = "Enter the lead passenger’s surname.";
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.email = "Enter a valid confirmation email address.";
  if (!/^[+0-9() .-]{7,30}$/.test(input.phone.trim())) errors.phone = "Enter a valid phone or WhatsApp number.";
  if (input.taxInvoice) {
    if ((input.taxName ?? "").trim().length < 2) errors.taxName = "Enter the company or full name for the tax invoice.";
    if (!/^\d{13}$/.test((input.taxId ?? "").replace(/[\s-]/g, ""))) errors.taxId = "Enter the 13-digit tax ID.";
    if ((input.taxAddress ?? "").trim().length < 10) errors.taxAddress = "Enter the full billing address.";
  }
  if (!input.termsAccepted) errors.termsAccepted = "Accept the booking terms and privacy notice to continue.";
  return errors;
}
