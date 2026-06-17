-- Add the new single-die game modes to the ruleset enum so rooms and matches
-- can select them. Peaceful disables capturing; Blitz ends on the first token
-- home. Both reuse the Classic single-die mechanics.
alter type public.ludo_ruleset add value if not exists 'peaceful';
alter type public.ludo_ruleset add value if not exists 'blitz';
