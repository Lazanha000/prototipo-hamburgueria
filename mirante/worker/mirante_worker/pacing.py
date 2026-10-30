"""Ritmo dos pedidos ao Instagram: espaçados, com variação, silêncio de madrugada e pausas longas."""
import random
import time


class Paused(Exception):
    """O coletor está em pausa (o Instagram pediu calma, ou é madrugada)."""


class Gate:
    def __init__(self, pace_min=4.0, pace_max=8.0, quiet=(2, 6), tz_offset_h=-3, clock=time.time, sleep=time.sleep, rand=random.random):
        self.pace_min, self.pace_max = pace_min, pace_max
        self.quiet, self.tz = quiet, tz_offset_h
        self.clock, self.sleep, self.rand = clock, sleep, rand
        self.last = 0.0
        self.paused_until = 0.0
        self.reason = ""
        self.count = 0

    def local_hour(self):
        return int(((self.clock() + self.tz * 3600) % 86400) // 3600)

    def is_quiet(self):
        a, b = self.quiet
        h = self.local_hour()
        return a <= h < b if a <= b else (h >= a or h < b)

    def pause(self, seconds, reason):
        self.paused_until = max(self.paused_until, self.clock() + seconds)
        self.reason = reason

    def check(self):
        """Levanta Paused se não é hora de falar com o Instagram."""
        if self.clock() < self.paused_until:
            raise Paused(self.reason)
        if self.is_quiet():
            raise Paused("Silêncio de madrugada")

    def wait(self):
        """Chamar antes de cada pedido ao Instagram."""
        self.check()
        gap = self.pace_min + (self.pace_max - self.pace_min) * self.rand()
        if self.rand() < 0.08:  # de vez em quando, uma pausa maior, como quem parou para ler
            gap += 15 + 30 * self.rand()
        delay = self.last + gap - self.clock()
        if delay > 0:
            self.sleep(delay)
        self.last = self.clock()
        self.count += 1
