import type { Metadata } from "next";
import BookingLookup from "../check/booking-lookup";
export const metadata:Metadata={title:"Manage your booking · Waydidi",robots:{index:false,follow:false}};
export default function ManageBookingPage(){return <BookingLookup/>;}
