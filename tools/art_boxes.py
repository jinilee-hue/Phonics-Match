"""Where each sprite sits in the reference images (original pixels; generous crops around the thing).
Shared by tools/cut_sprites.py (mattes), tools/clean_bg.py (what to paint out) and tools/build_art.py."""
# name: ('game' | 'title' | 'antseal', (x0, y0, x1, y1))
JOBS = {
    'monkey_a': ('game', (705, 345, 970, 615)),
    'monkey_b': ('game', (705, 890, 970, 1160)),
    'gator_a': ('game', (975, 345, 1240, 615)),
    'gator_b': ('game', (705, 620, 970, 885)),
    'gator_c': ('game', (975, 1160, 1240, 1430)),
    'snake_a': ('game', (1245, 345, 1510, 615)),
    'snake_b': ('game', (975, 620, 1240, 885)),
    'tiger_a': ('game', (705, 1160, 970, 1430)),
    'tiger_b': ('game', (1780, 345, 2045, 615)),
    'pig_a': ('game', (1780, 1160, 2045, 1430)),
    'pig_b': ('game', (1780, 890, 2045, 1160)),
    'pig_c': ('game', (1510, 890, 1775, 1160)),
    # FPR K Unit 1 animals the mockup doesn't have (user's art in the same style, design/ant_seal.png, 2752×1536,
    # each face ~1000 px on white; the floor shadows under them start at y 1372 — kept out of the boxes)
    'ant': ('antseal', (200, 170, 1280, 1325)),
    'seal': ('antseal', (1375, 260, 2645, 1315)),
    'tutor_t': ('title', (1880, 560, 2620, 1320)),
    'tutor_g': ('game', (2080, 760, 2752, 1536)),
    # title screen pieces
    'logo': ('title', (720, 190, 2040, 860)),
    'play': ('title', (1000, 850, 1760, 1210)),
    'l_m_red': ('title', (250, 210, 600, 526)),   # bottom 526: the left leg ends at y 515 (510 cut it off); the pink star starts at 531
    'l_m_blue': ('title', (130, 610, 450, 930)),
    'l_a_blue': ('title', (530, 570, 780, 840)),
    'l_t_top': ('title', (2096, 124, 2360, 424)),
    'l_p_top': ('title', (2356, 370, 2620, 600)),
    'l_t_bot': ('title', (1280, 1216, 1530, 1504)),
    'l_p_bot': ('title', (1684, 1124, 1964, 1404)),
    # game screen letter badges (speech-bubble letters on the board edge)
    'b_m': ('game', (590, 400, 725, 550)),
    'b_s': ('game', (595, 895, 740, 1040)),
    'b_a': ('game', (2010, 365, 2155, 505)),
    'b_p': ('game', (2005, 615, 2155, 760)),
    # HUD coin
    'coin': ('game', (1080, 50, 1230, 200)),
}
BOXES = {k: v[1] for k, v in JOBS.items()}
