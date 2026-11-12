import os,runpy,subprocess
from pathlib import Path
assert os.environ['GITHUB_REF_NAME']=='improvements/stage-4-quality-pwa'
root=Path('.review')
for name in ['quality_data','quality_integrations','quality_ui','quality_structure']:
 runpy.run_path(str(root/(name+'.py')))
subprocess.run(['node','scripts/organize-imports.cjs'],check=True)
p=Path('src/services/legacyCloudReader.ts')
s=p.read_text().replace('      const readAll = async','      const client=supabase;\n      const readAll = async').replace('await supabase.from(table)','await client.from(table)').replace(".eq('id',userId).maybeSingle().abortSignal(AbortSignal.timeout(10000))",".eq('id',userId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()")
p.write_text(s)
for name in ['quality_pwa','quality_checks']:
 runpy.run_path(str(root/(name+'.py')))
subprocess.run(['node','scripts/organize-imports.cjs'],check=True)
runpy.run_path(str(root/'quality_final.py'))
subprocess.run(['node','scripts/organize-imports.cjs'],check=True)
subprocess.run(['npm','run','format'],check=True,stdout=subprocess.DEVNULL)
runpy.run_path(str(root/'quality_post.py'))
p=Path('src/services/securityService.ts')
lines=[]
for line in p.read_text().splitlines():
 if 'eslint-disable-next-line no-control-regex' in line: continue
 if '.replace(' in line and ('\\u0000' in line or chr(0) in line):
  line="    .split('').filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('')"
 lines.append(line)
p.write_text('\n'.join(lines)+'\n')
subprocess.run(['node','scripts/organize-imports.cjs'],check=True)
subprocess.run(['npm','run','format'],check=True,stdout=subprocess.DEVNULL)
runpy.run_path(str(root/'quality_guard.py'))
subprocess.run(['node','scripts/organize-imports.cjs'],check=True)
subprocess.run(['npm','run','format'],check=True,stdout=subprocess.DEVNULL)
