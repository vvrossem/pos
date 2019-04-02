# Copyright 2019 Coop IT Easy SCRLfs
# 	    Vincent Van Rossem <vvrossem@gmail.com>
# License AGPL-3.0 or later (http://www.gnu.org/licenses/agpl.html).

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

# Bixolon BCD-1100 COMMANDS
INIT_DISPLAY = b'\x1B\x40'
MOVE_CURSOR_TO = b'\x1B\x6C'
SET_CURSOR_OFF = b'\x1F\x43\x00'
SELECT_USER_DEFINED_CHAR = b'\x1B\x25\x01'
DEFINE_USER_DEFINED_CHAR = b'\x1B\x26\x01'
EURO_SYMBOL_DRAWING = b'\x05\x14\x3E\x55\x41\x22'


def draw_euro_symbol(ser, char_code):
    char_code = char_code.encode('ascii')
    print('char_code encoded:', char_code)
    cmd = DEFINE_USER_DEFINED_CHAR + char_code + char_code + EURO_SYMBOL_DRAWING
    ser.write(cmd)
    ser.write(SELECT_USER_DEFINED_CHAR)


def display_text(ser, line1, line2):
    print("\nset lines to the right length (%s)" % DEVICE_COLS)
    for line in [line1, line2]:
        if len(line) < DEVICE_COLS:
            line += ' ' * (DEVICE_COLS - len(line))
        elif len(line) > DEVICE_COLS:
            line = line[0:DEVICE_COLS]
        assert len(line) == DEVICE_COLS, 'Wrong length'

    print("\ntry to draw euro symbol")
    draw_euro_symbol(ser, '~')
    print('\tdraw euro symbol done')

    print("\ntry to position at start of 1st line")
    l1 = MOVE_CURSOR_TO + chr(1).encode('ascii') + chr(1).encode('ascii')
    ser.write(l1)
    print("\tposition done")

    print("\ntry to write 1st line")
    ser.write(unidecode(line1).encode('ascii'))
    print("\twrite 1st line done")

    time.sleep(1)

    print("\ntry to position at start of 2nd line")
    l2 = MOVE_CURSOR_TO + chr(1).encode('ascii') + chr(2).encode('ascii')
    ser.write(l2)
    print("\tposition done")

    print("\ntry to write 2nd line")
    ser.write(unidecode(line2).encode('ascii'))
    print("\twrite 2nd line done")


def open_close_display(line1, line2):
    ser = False
    try:
        print("open serial port")
        ser = Serial(DEVICE, DEVICE_RATE, timeout=2)
        print("serial port open =", ser.isOpen())
        print("serial name =", ser.name)

        print("\ntry to (re)initialize display")
        ser.write(INIT_DISPLAY)
        print("\t(re)initialize display done")

        print("\ntry to set cursor to off")
        ser.write(SET_CURSOR_OFF)
        print("\tcursor set to off")

        display_text(ser, line1, line2)
    except Exception as e:
        print('EXCEPTION e={}'.format(e))
        sys.exit(1)
    finally:
        if ser:
            print("\nclose serial port")
            ser.close()


if __name__ == '__main__':
    line1 = 'Coop IT Easy'
    line2 = 'Draw € symbol: ~'
    open_close_display(line1, line2)
