export type ReviewFieldErrors = Partial<
  Record<"name" | "surname" | "email" | "phone" | "termsAccepted", string>
>;

export function validateBookingReview(input: {
  name: string;
  surname: string;
  email: string;
  phone: string;
  termsAccepted: boolean;
}) {
  const errors: ReviewFieldErrors = {};
  if (input.name.trim().length < 2) errors.name = "Enter the lead passenger’s full name.";
  if (input.surname.trim().length < 1) errors.surname = "Enter the lead passenger’s surname.";
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) errors.email = "Enter a valid confirmation email address.";
  if (!/^[+0-9() .-]{7,30}$/.test(input.phone.trim())) errors.phone = "Enter a valid phone or WhatsApp number.";
  if (!input.termsAccepted) errors.termsAccepted = "Accept the booking terms and privacy notice to continue.";
  return errors;
}
