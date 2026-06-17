-- Clear legacy UNK interior/exterior marker (unset → display as "—").
UPDATE scenes SET int_ext = NULL WHERE int_ext = 'UNK';
