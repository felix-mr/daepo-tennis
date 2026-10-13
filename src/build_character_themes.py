"""Build character themes from the sourced catalogue, preserving legacy art/styles."""
import json
from pathlib import Path
from urllib.parse import quote


# Original geometric motifs, one visual language for each series.
SERIES_PATTERNS = {
    'jujutsu-kaisen': '<circle cx="80" cy="80" r="62"/><circle cx="80" cy="80" r="45"/><path d="M80 5v26m0 98v26M5 80h26m98 0h26M26 26l19 19m70 70 19 19M26 134l19-19m70-70 19-19"/>',
    'demon-slayer': '<path d="M-40 40q40-50 80 0t80 0t80 0M-40 80q40-50 80 0t80 0t80 0M-40 120q40-50 80 0t80 0t80 0M-40 160q40-50 80 0t80 0t80 0"/>',
    'hunter-x-hunter': '<path d="m80 10 60 70-60 70L20 80ZM80 35l40 45-40 45-40-45ZM0 0l160 160M160 0 0 160"/>',
    'attack-on-titan': '<path d="M0 10h160M0 60h160M0 110h160M40 10v50m80-50v50M80 60v50M40 110v50m80-50v50M0 0l160 160M160 0 0 160"/>',
    'one-piece': '<circle cx="80" cy="80" r="52"/><path d="m80 10 13 57 57 13-57 13-13 57-13-57-57-13 57-13ZM0 150q20-15 40 0t40 0t40 0t40 0"/>',
    'naruto': '<path d="M80 80c-28-32-45 17-10 26 49 13 62-61 11-72C3 17 9 137 84 140c56 2 78-36 76-83M0 0l35 35M125 125l35 35"/>',
    'bleach': '<path d="m0 160 70-90M50 160 100 60M110 140 160 40M0 70 50 0M20 150 150 20M20 130 130 20"/>',
}


def character_scene(series, character):
    palette = character['palette']
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g fill="none" stroke="' + palette['primary'] + '" stroke-opacity=".075" stroke-width="1.2">' + SERIES_PATTERNS[series['id']] + '</g></svg>'
    return {'primary': palette['primary'], 'accent': palette['accent'],
            'background': palette['background'], 'pattern': 'url("data:image/svg+xml,' + quote(svg, safe='') + '")',
            'name': character['romanizedName'].upper()}


def build_character_themes(root):
    root = Path(root)
    catalog = json.loads((root / 'data/character-catalog.json').read_text())
    base = (root / 'themes/club.css').read_text()
    portrait = (root / 'src/concept-scene.css').read_text() + '\n' + (root / 'src/character-theme.css').read_text()
    for series in catalog['series']:
        for character in series['characters']:
            key = character['id']
            target = root / 'themes' / (key + '.json')
            metadata = {**character, 'seriesId': series['id'], 'seriesName': series['name']}
            metadata['scene'] = character_scene(series, character)
            metadata.pop('id')
            if key in ('gojo', 'geto', 'toji'):
                theme = json.loads(target.read_text())
                # Legacy labels, CSS and art continue to render archived weeks.
                theme.update({k: v for k, v in metadata.items() if k not in ('name', 'heroImage', 'heroAlt')})
            else:
                theme = {**metadata, 'stylesheet': 'themes/' + key + '.css',
                         'eyebrow': series['name'] + ' // DAEPO TENNIS',
                         'title': '대포클럽', 'accent': character['name'], 'characterPortrait': True}
                palette = character['palette']
                colors = ':root{--concept-primary:' + palette['primary'] + ';--concept-accent:' + palette['accent'] + ';--concept-background:' + palette['background'] + ';--concept-pattern:' + metadata['scene']['pattern'] + '}\n'
                (root / theme['stylesheet']).write_text(base + '\n' + portrait + '\n' + colors)
            target.write_text(json.dumps(theme, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    build_character_themes(Path(__file__).resolve().parents[1])
