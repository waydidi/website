import { BookingFlow } from "@/components/home/booking-flow";
import { ThailandDestinationMap } from "@/components/home/destination-map";
import { WaydidiFooter } from "@/components/home/footer";
import { ServiceCards } from "@/components/home/service-cards";

// The booking flow is interactive and owns the page; the marketing sections
// below it render on the server and are handed in as children, so they ship
// as HTML rather than as part of the client bundle.
export default function Home() {
  return (
    <BookingFlow>
      <ServiceCards />
      <ThailandDestinationMap />
      <WaydidiFooter />
    </BookingFlow>
  );
}
