-- Clear legacy UNK time-of-day; new values DAWN/DUSK/TIMELESS need no column change (TEXT).
UPDATE scenes SET day_night = NULL WHERE day_night = 'UNK';
