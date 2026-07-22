1. Open the POS configuration and enable **Allow Payments in Other Currencies**.
2. Configure payment methods linked to bank or cash journals in the desired currencies.
   You can add several cash methods (one journal / currency per cash register).
   On each cash method, set **Incoming** / **Outgoing Payment Method** lines so cash in/out
   posts against the outstanding receipts / payments accounts from Accounting
   (see CONFIGURE.md).
3. Open a POS session. The opening popup shows an opening amount for each cash method.
4. Use **Cash In/Out** and select the target cash register when more than one cash method exists.
   Amounts are recorded on that method's journal and currency; the counterpart account comes
   from the payment method line configured on that POS payment method.
5. Pay orders normally. For a foreign cash or bank method, enter the amount in the payment currency.
6. On closing, the closing popup shows a cash count block per cash method (opening, payments,
   cash in/out, counted, difference) plus the usual bank counts. Differences are posted to each
   cash journal's profit/loss account.
7. Use the **Moneda** button on product and payment screens to change the display currency.
8. Review payment details, applied rates, and audit messages from **Point of Sale > Multi-Currency Payments**.
