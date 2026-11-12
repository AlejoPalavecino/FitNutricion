import os,runpy
from pathlib import Path
assert os.environ['GITHUB_REF_NAME']=='improvements/stage-3-domain-consistency'
runpy.run_path('.review/domain.py')
runpy.run_path('.review/domain_tests.py')
for p in Path('src').rglob('*'):
 if p.suffix in ('.ts','.tsx'):
  p.write_text('\n'.join(line.rstrip() for line in p.read_text().splitlines())+'\n')
