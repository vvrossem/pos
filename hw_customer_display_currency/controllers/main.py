# -*- coding: utf-8 -*-
# Copyright 2019 Coop IT Easy SCRLfs
# 	    Vincent Van Rossem <vvrossem@gmail.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

import logging
import json as simplejson

import odoo.addons.hw_proxy.controllers.main as hw_proxy
from odoo.addons.hw_customer_display.controllers.main import CustomerDisplayDriver
from odoo import http

logger = logging.getLogger(__name__)

SELECT_USER_DEFINED_CHAR = b'\x1B\x25\x01'
DEFINE_USER_DEFINED_CHAR = b'\x1B\x26\x01'
EURO_SYMBOL_DRAWING = b'\x05\x14\x3E\x55\x41\x22'

try:
    from serial import Serial
    from unidecode import unidecode
except (ImportError, IOError) as err:
    logger.debug(err)


class CustomerDisplayCurrencyDriver(CustomerDisplayDriver):
    def __init__(self):
        super().__init__()
        self.currency_char_code = None
        self.currency_code = None

    def set_currency_code(self, currency_code):
        self.currency_code = currency_code

    def set_currency_char_code(self, currency_char_code):
        self.currency_char_code = currency_char_code.encode('ascii')

    def send_currency_data_customer_display(self, currency_data):
        currency_data = simplejson.loads(currency_data)
        self.set_currency_code(currency_data['currency_code'])
        self.set_currency_char_code(currency_data['currency_char'])

    def draw_euro_symbol(self):
        cmd = DEFINE_USER_DEFINED_CHAR + self.currency_char_code + self.currency_char_code + EURO_SYMBOL_DRAWING
        self.serial_write(cmd)
        self.serial_write(SELECT_USER_DEFINED_CHAR)
        logger.debug('Draw euro symbol')

    def send_text_customer_display(self, text_to_display):
        """This function sends the data to the serial/usb port.
        We open and close the serial connection on every message display.
        Why ?
        1. Because it is not a problem for the customer display
        2. Because it is not a problem for performance, according to my tests
        3. Because it allows recovery on errors : you can unplug/replug the
        customer display and it will work again on the next message without
        problem
        """
        lines = simplejson.loads(text_to_display)
        assert isinstance(lines, list), 'lines_list should be a list'
        try:
            logger.debug(
                'Opening serial port %s for customer display with baudrate %d'
                % (self.device_name, self.device_rate))
            self.serial = Serial(
                self.device_name, self.device_rate,
                timeout=self.device_timeout)
            logger.debug('serial.is_open = %s' % self.serial.isOpen())
            self.setup_customer_display()
            self.clear_customer_display()
            if self.currency_code == 'EUR':
                self.draw_euro_symbol()
            self.display_text(lines)
        except Exception as e:
            logger.error('Exception in serial connection: %s' % str(e))
        finally:
            if self.serial:
                logger.debug('Closing serial port for customer display')
                self.serial.close()

    def run(self):
        while True:
            try:
                timestamp, task, data = self.queue.get(True)
                if task == 'display':
                    self.send_text_customer_display(data)
                elif task == 'currency':
                    self.send_currency_data_customer_display(data)
                elif task == 'status':
                    serial = Serial(
                        self.device_name, self.device_rate,
                        timeout=self.device_timeout)
                    if serial.isOpen():
                        self.set_status(
                            'connected',
                            'Connected to %s' % self.device_name
                        )
                        self.serial = serial
            except Exception as e:
                self.set_status('error', str(e))


driver = CustomerDisplayCurrencyDriver()

hw_proxy.drivers['customer_display'] = driver


class CustomerDisplayCurrencyProxy(hw_proxy.Proxy):
    @http.route(
        '/hw_proxy/send_text_customer_display', type='json', auth='none',
        cors='*')
    def send_text_customer_display(self, text_to_display):
        logger.debug(
            'LCD: Call send_text_customer_display with text=%s',
            text_to_display)
        driver.push_task('display', text_to_display)

    @http.route(
        '/hw_proxy/send_currency_data_customer_display', type='json', auth='none',
        cors='*')
    def send_currency_data_customer_display(self, currency_data):
        logger.debug(
            'LCD: Call send_currency_data_customer_display with json=%s',
            currency_data)
        driver.push_task('currency', currency_data)
