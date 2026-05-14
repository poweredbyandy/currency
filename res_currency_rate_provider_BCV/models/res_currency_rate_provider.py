import logging
from collections import defaultdict
from datetime import datetime

import pytz
import requests
from lxml import etree

from odoo import fields, models

_logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = (10, 60)
CURRENCIES = {
    "EUR": "euro",
    "CNY": "yuan",
    "TRY": "lira",
    "RUB": "rublo",
    "USD": "dolar",
}
CARACAS_TZ = pytz.timezone("America/Caracas")


class ResCurrencyRateProvider(models.Model):
    _inherit = "res.currency.rate.provider"

    service = fields.Selection(
        selection_add=[("bcv", "BCV scraping")],
        ondelete={"bcv": "set default"},
    )

    def _get_supported_currencies(self):
        self.ensure_one()
        if self.service != "bcv":
            return super()._get_supported_currencies()
        return list(CURRENCIES.keys())

    def _obtain_rates(self, base_currency, currencies, date_from, date_to):
        self.ensure_one()
        if self.service != "bcv":
            return super()._obtain_rates(base_currency, currencies, date_from, date_to)

        _logger.info(
            "BCV proveedor id=%s: solicitud tasas base=%s monedas=%s desde=%s hasta=%s",
            self.id,
            base_currency,
            currencies,
            date_from,
            date_to,
        )

        content = defaultdict(dict)

        bcv_data = self._scrap(currencies)

        if not bcv_data:
            _logger.warning(
                "BCV proveedor id=%s: no se obtuvo ninguna tasa (revisar red, HTML del BCV o xpath)",
                self.id,
            )

        for k, v in bcv_data.items():
            dt = v[1].isoformat()
            content[dt][k] = v[0]

        _logger.info(
            "BCV proveedor id=%s: respuesta con %s fecha(s) de cotización",
            self.id,
            len(content),
        )

        return content

    def _scrap(self, available_currencies):
        request_url = "http://www.bcv.org.ve/"

        rslt = {}
        _logger.info(
            "BCV: GET %s timeout=%s",
            request_url,
            REQUEST_TIMEOUT,
        )
        try:
            fetched_data = requests.get(
                request_url, verify=False, timeout=REQUEST_TIMEOUT
            )
        except Exception:
            _logger.exception(
                "BCV proveedor id=%s: fallo de red o timeout al contactar %s",
                self.id,
                request_url,
            )
            return rslt

        if fetched_data.status_code != 200:
            _logger.warning(
                "BCV proveedor id=%s: HTTP %s al obtener %s",
                self.id,
                fetched_data.status_code,
                request_url,
            )
            return rslt

        available_currency_names = available_currencies

        try:
            htmlelem = etree.fromstring(fetched_data.content, etree.HTMLParser())
        except Exception:
            _logger.exception(
                "BCV proveedor id=%s: no se pudo parsear HTML (tamaño body=%s)",
                self.id,
                len(fetched_data.content or b""),
            )
            return rslt

        dt = datetime.now(CARACAS_TZ)
        for currency_name in available_currency_names:
            try:
                if currency_name in ["Bs", "VES", "VEF", "VED"]:
                    rslt[currency_name] = (1.0, dt)
                else:
                    sValue = htmlelem.xpath(
                        f".//div[@id='{CURRENCIES[currency_name]}']/div/div/div[2]/strong"
                    )[0].text
                    value = float(sValue.replace(" ", "").replace(",", "."))

                    rslt[currency_name] = (1.0 / value, dt)
            except Exception as err:
                _logger.warning(
                    "BCV proveedor id=%s: no se pudo leer la tasa para %s: %s",
                    self.id,
                    currency_name,
                    err,
                )

        _logger.info(
            "BCV proveedor id=%s: scraping OK para monedas %s",
            self.id,
            list(rslt.keys()),
        )

        return rslt
