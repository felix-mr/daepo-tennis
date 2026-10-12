"""Build character themes from the sourced catalogue, preserving legacy art/styles."""
import json
from pathlib import Path


def build_character_themes(root):
    root = Path(root)
    catalog = json.loads((root / 'data/character-catalog.json').read_text())
    base = (root / 'themes/club.css').read_text()
    portrait = (root / 'src/character-theme.css').read_text()
    for series in catalog['series']:
        for character in series['characters']:
            key = character['id']
            target = root / 'themes' / (key + '.json')
            metadata = {**character, 'seriesId': series['id'], 'seriesName': series['name']}
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
                colors = ':root{--concept-primary:' + palette['primary'] + ';--concept-accent:' + palette['accent'] + ';--concept-background:' + palette['background'] + '}\n'
                (root / theme['stylesheet']).write_text(base + '\n' + portrait + '\n' + colors)
            target.write_text(json.dumps(theme, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    build_character_themes(Path(__file__).resolve().parents[1])
