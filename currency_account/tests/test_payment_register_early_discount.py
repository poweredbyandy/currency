from odoo import Command
from odoo.addons.account.tests.common import AccountTestInvoicingCommon
from odoo.tests import tagged


@tagged("post_install", "-at_install")
class TestCurrencyAccountEarlyPaymentRegister(AccountTestInvoicingCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.early_pay_term = cls.env["account.payment.term"].create(
            {
                "name": "10% if paid within 10 days",
                "company_id": cls.company_data["company"].id,
                "early_discount": True,
                "discount_percentage": 10,
                "discount_days": 10,
                "early_pay_discount_computation": "included",
                "line_ids": [
                    Command.create(
                        {
                            "value": "percent",
                            "nb_days": 0,
                            "value_amount": 100,
                        }
                    )
                ],
            }
        )

    def _create_posted_invoice(self, payment_term, amount=1000.0):
        invoice = self.env["account.move"].create(
            {
                "move_type": "out_invoice",
                "partner_id": self.partner_a.id,
                "invoice_date": "2019-01-01",
                "date": "2019-01-01",
                "invoice_payment_term_id": payment_term.id,
                "invoice_line_ids": [
                    Command.create(
                        {
                            "product_id": self.product_a.id,
                            "price_unit": amount,
                            "tax_ids": [],
                        }
                    )
                ],
            }
        )
        invoice.action_post()
        return invoice

    def test_payment_difference_stays_open_without_early_discount(self):
        invoice = self._create_posted_invoice(self.pay_terms_a)
        wizard = (
            self.env["account.payment.register"]
            .with_context(active_model="account.move", active_ids=invoice.ids)
            .create({"payment_date": "2019-01-02"})
        )
        self.assertFalse(wizard.early_payment_discount_mode)
        self.assertEqual(wizard.payment_difference_handling, "open")

    def test_payment_difference_reconciles_with_early_discount(self):
        invoice = self._create_posted_invoice(self.early_pay_term)
        wizard = (
            self.env["account.payment.register"]
            .with_context(active_model="account.move", active_ids=invoice.ids)
            .create({"payment_date": "2019-01-02"})
        )
        self.assertTrue(wizard.early_payment_discount_mode)
        self.assertEqual(wizard.payment_difference_handling, "reconcile")
        self.assertEqual(wizard.amount, 900.0)

    def test_register_payment_creates_early_discount_writeoff(self):
        invoice = self._create_posted_invoice(self.early_pay_term)
        payment = (
            self.env["account.payment.register"]
            .with_context(active_model="account.move", active_ids=invoice.ids)
            .create({"payment_date": "2019-01-02"})
            ._create_payments()
        )
        epd_accounts = (
            payment.company_id.account_journal_early_pay_discount_loss_account_id
            | payment.company_id.account_journal_early_pay_discount_gain_account_id
        )
        epd_lines = payment.move_id.line_ids.filtered(
            lambda line: line.display_type == "epd" or line.account_id in epd_accounts
        )
        self.assertTrue(payment.is_reconciled)
        self.assertTrue(epd_lines)
        self.assertAlmostEqual(
            sum(abs(line.amount_currency) for line in epd_lines), 100.0, places=2
        )
        self.assertTrue(invoice.currency_id.is_zero(invoice.amount_residual))
