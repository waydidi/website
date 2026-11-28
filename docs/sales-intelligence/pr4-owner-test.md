# Sales Intelligence PR 4 test guide

Use the existing Meta WhatsApp test number and a test environment approved by the owner. Keep `SALES_AI_MEDIA` off in production while reviewing. Enable `SALES_AI_MEDIA=1` and `SALES_AI_QUOTE_APPROVAL=whatsapp` in the test environment. The owner must have an active owner staff account linked to their Telegram account.

1. Send a synthetic flight screenshot and a synthetic itinerary PDF. Check that the assistant uses the trip details and asks you to confirm them. A synthetic transfer slip should never mark anything paid. Try a screenshot over 5 MiB or a PDF over 8 MiB. The assistant should ask you to type the details if it cannot read the file.
2. Ask for two simple transfers on different future dates. Check that there is one English approval card with two route lines and website prices. Edit one price and try its old approval button. Approve using the current card. Open only one of the links and accept it. Check that the other leg can still be accepted separately. In a second test quote, edit a leg in CRM and check that a link for another unaccepted leg from the earlier quote shows it is unavailable.
3. Try a child seat and an oversized bag or wheelchair. Check that the card shows the existing child-seat add-on and requires an owner-entered price and a fit check for unsupported equipment. Accept the quote and verify the child-seat count is prefilled and fixed as an existing priced add-on on the booking form. One request applies the same child-seat count to every leg in the quote. An hourly-hire request should go to staff.
4. Ask for a multi-day sightseeing itinerary. Open **Review itinerary draft** from the Telegram card. Check the grouped days and stops already saved in the existing trip builder. Check that the draft is unpriced and unpublished and only the owner can publish it.
5. Disable `SALES_AI_MEDIA` to turn the new intake and draft tools off again. Existing issued quotes retain their normal expiry and revision checks.

Raw supported files are private and purged with the existing AI activity retention period (180 days by default). Use synthetic files without personal details in tests.
