-- Extreme mode: Classic-family single-die rules plus collectible power tiles
-- (v1: shields that block one capture). Add it to the ruleset enum so online
-- rooms and matches can select it.
alter type public.ludo_ruleset add value if not exists 'extreme';
