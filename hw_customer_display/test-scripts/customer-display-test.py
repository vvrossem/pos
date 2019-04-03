# -*- coding: utf-8 -*-
# Author : Alexis de Lattre <alexis.delattre@akretion.com>
# The licence is in the file __manifest__.py
# This is a test script, that you can use if you want to test/play
# with the customer display independantly from the Odoo server
# It has been tested with a Bixolon BCD-1100

import sys
import logging
import time

_logger = logging.getLogger(__name__)

try:
    from serial import Serial
    from unidecode import unidecode
except (ImportError, IOError) as err:
    _logger.debug(err)

DEVICE = '/dev/bixolon'
DEVICE_RATE = 9600
DEVICE_COLS = 20

CLEAR_DISPLAY = b'\x0C'
MOVE_CURSOR_TO = b'\x1B\x6C'
CURSOR_OFF = b'\x1F\x43\x00'


def display_text(ser, line1, line2):
    print(("set lines to the right length (%s)" % DEVICE_COLS))
    for line in [line1, line2]:
        if len(line) < DEVICE_COLS:
            line += ' ' * (DEVICE_COLS - len(line))
        elif len(line) > DEVICE_COLS:
            line = line[0:DEVICE_COLS]
        assert len(line) == DEVICE_COLS, 'Wrong length'
    print("try to clear display")
    ser.write(CLEAR_DISPLAY)
    print("clear done")
    print("try to position at start of 1st line")
    l1 = MOVE_CURSOR_TO + chr(1).encode('ascii') + chr(1).encode('ascii')
    ser.write(l1)
    print("position done")
    print("try to write 1st line")
    ser.write(unidecode(line1).encode('ascii'))
    print("write 1st line done")
    time.sleep(1)
    print("try to position at start of 2nd line")
    l2 = MOVE_CURSOR_TO + chr(1).encode('ascii') + chr(2).encode('ascii')
    ser.write(l2)
    print("position done")
    print("try to write 2nd line")
    ser.write(unidecode(line2).encode('ascii'))
    print("write done")


def open_close_display(line1, line2):
    ser = False
    try:
        print("open serial port")
        ser = Serial(DEVICE, DEVICE_RATE, timeout=2)
        print(("serial port open =", ser.isOpen()))
        print(("serial name =", ser.name))
        print("try to set cursor to off")
        ser.write(CURSOR_OFF)
        print("cursor set to off")
        display_text(ser, line1, line2)
    except Exception as e:
        print(('EXCEPTION e={}'.format(e)))
        sys.exit(1)
    finally:
        if ser:
            print("close serial port")
            ser.close()


if __name__ == '__main__':
    line1 = 'Coop IT Easy'
    line2 = 'Migration to 12.0'
    open_close_display(line1, line2)
