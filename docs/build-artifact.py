# Construit la version Artifact à partir de docs/index.html :
#  • enlève l'enveloppe <!doctype>/<html>/<head>/<body>
#  • inline Bootstrap (CSS et JS) et toutes les images
import base64, re, os, sys

src = open('docs/index.html', encoding='utf-8').read()
head = src[src.index('<title>'):src.index('</head>')]
head = '\n'.join(l for l in head.splitlines() if not l.startswith('<meta name="description"'))
body = src[src.index('<body>') + len('<body>'):src.index('</body>')]
page = head.strip() + '\n' + body

def read(rel):
    return open(os.path.join('docs', rel), 'rb').read()

def data_uri(rel, mime):
    return 'data:%s;base64,%s' % (mime, base64.b64encode(read(rel)).decode())

# Bootstrap : la feuille en ligne (la CSP des Artifacts n'accepte pas de
# feuille externe), le script en ligne aussi pour ne dépendre d'aucun CDN.
page = page.replace('<link rel="stylesheet" href="vendor/bootstrap.min.css">',
                    '<style>\n' + read('vendor/bootstrap.min.css').decode('utf-8') + '\n</style>')
page = page.replace('<script src="vendor/bootstrap.min.js"></script>',
                    '<script>\n' + read('vendor/bootstrap.min.js').decode('utf-8') + '\n</script>')

page = re.sub(r'src="(img/[^"]+\.jpg)"', lambda m: 'src="%s"' % data_uri(m.group(1), 'image/jpeg'), page)
page = page.replace('url("img/bike.png")', 'url("%s")' % data_uri('img/bike.png', 'image/png'))

for leftover in ('img/', 'vendor/'):
    assert leftover not in page, 'référence non inlinée : ' + leftover

out = sys.argv[1]
open(out, 'w', encoding='utf-8').write(page)
print('artefact', round(len(page) / 1024), 'Ko ·', page.count('data:image'), 'images ·',
      'bootstrap css+js inlinés')
