from pathlib import Path
import json, subprocess, tempfile, shutil, zipfile, sys
from datetime import datetime, timezone
try:
    from PIL import Image, ImageFilter
except Exception:
    print('ERROR: falta Pillow. Ejecuta el BAT; lo instala automáticamente.')
    raise

HERE=Path(__file__).resolve().parent
# Funciona tanto en el kit raíz como dentro de TITAN_REFEREES_CURRENT/tools/REAL_ESRGAN_TURBO
if (HERE/'TITAN_REFEREES_CURRENT').exists():
    ROOT=HERE/'TITAN_REFEREES_CURRENT'
elif HERE.name=='REAL_ESRGAN_TURBO' and HERE.parent.name=='tools':
    ROOT=HERE.parent.parent
else:
    ROOT=HERE/'TITAN_REFEREES_CURRENT'

def find_exe():
    roots=[HERE/'REAL_ESRGAN', HERE, ROOT/'tools'/'REAL_ESRGAN_TURBO'/'REAL_ESRGAN']
    for r in roots:
        if not r.exists(): continue
        hits=list(r.rglob('realesrgan-ncnn-vulkan.exe'))
        if hits: return hits[0]
    return None

def square(im):
    im=im.convert('RGBA')
    side=max(im.size)
    bg=Image.new('RGBA',(side,side),(0,0,0,0))
    bg.paste(im,((side-im.width)//2,(side-im.height)//2),im)
    return bg

def pack(root,outzip):
    if outzip.exists(): outzip.unlink()
    with zipfile.ZipFile(outzip,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(root.rglob('*')):
            if not p.is_file(): continue
            rel=p.relative_to(root.parent)
            # El ejecutable/modelos no van a GitHub; los BAT sí.
            if 'REAL_ESRGAN' in rel.parts and p.name.lower().endswith(('.exe','.dll','.bin','.param')): continue
            z.write(p,rel.as_posix())
    with zipfile.ZipFile(outzip) as z:
        bad=z.testzip()
    if bad: raise RuntimeError(f'ZIP corrupto: {bad}')

def main():
    print('\n============================================================')
    print(' INCASTATS · REFEREE FACES · REAL-ESRGAN TURBO BATCH')
    print(' UNA SOLA EJECUCION NATIVA PARA TODO EL LOTE PENDIENTE')
    print('============================================================\n')
    if not (ROOT/'referees_master.json').exists():
        print('ERROR: primero ejecuta 01_CREAR_TITAN_REFEREES_CURRENT_COMPLETO.bat')
        return 2
    exe=find_exe()
    if not exe:
        print('ERROR: Real-ESRGAN no está instalado.')
        print('Ejecuta primero: 02_INSTALAR_REAL_ESRGAN_UNA_VEZ.bat')
        return 3
    orig=ROOT/'faces'/'original'; web=ROOT/'faces'/'web_1024'; web.mkdir(parents=True,exist_ok=True)
    imgs=[p for p in orig.iterdir() if p.is_file() and p.suffix.lower() in {'.jpg','.jpeg','.png','.webp'}]
    pending=[p for p in imgs if not (web/f'{p.stem}.webp').exists()]
    print('Originales:',len(imgs))
    print('Ya HD:',len(imgs)-len(pending))
    print('Pendientes:',len(pending))
    if not pending:
        print('Nada pendiente. Reempaquetando...')
    tmp=Path(tempfile.mkdtemp(prefix='inca_ref_esrgan_'))
    inp=tmp/'input'; ai=tmp/'ai'; inp.mkdir(); ai.mkdir()
    try:
        for i,p in enumerate(pending,1):
            with Image.open(p) as im:
                square(im).save(inp/f'{p.stem}.png','PNG',optimize=True)
            if i%100==0 or i==len(pending): print(f'Preparadas {i}/{len(pending)}')
        if pending:
            modeldir=exe.parent/'models'
            print('\nReal-ESRGAN arrancando en modo LOTE...')
            print('No cierres la ventana aunque el ejecutable muestre porcentajes repetidos.')
            cmd=[str(exe),'-i',str(inp),'-o',str(ai),'-n','realesrgan-x4plus','-s','4','-m',str(modeldir),'-t','256','-f','png']
            subprocess.run(cmd,cwd=exe.parent,check=True)
            print('\nConvirtiendo salida IA a WEBP 1024 para la app...')
            done=0
            for p in pending:
                src=ai/f'{p.stem}.png'
                if not src.exists():
                    print('AVISO: sin salida IA para',p.name); continue
                with Image.open(src) as im:
                    im=square(im).resize((1024,1024),Image.Resampling.LANCZOS)
                    im=im.filter(ImageFilter.UnsharpMask(radius=0.55,percent=104,threshold=3))
                    bg=Image.new('RGB',im.size,(244,246,247))
                    if im.mode=='RGBA': bg.paste(im,mask=im.getchannel('A'))
                    else: bg.paste(im.convert('RGB'))
                    bg.save(web/f'{p.stem}.webp','WEBP',quality=89,method=6)
                done+=1
                if done%50==0 or done==len(pending): print(f'WEBP {done}/{len(pending)}')
    finally:
        shutil.rmtree(tmp,ignore_errors=True)

    # Actualiza mapa de caras
    mp=ROOT/'faces'/'rutas_imagenes_referees.json'
    arr=json.loads(mp.read_text(encoding='utf-8-sig')) if mp.exists() else []
    byid={int(x['referee_id']):x for x in arr if x.get('referee_id') is not None}
    for p in imgs:
        rid=int(p.stem)
        wp=web/f'{rid}.webp'
        if wp.exists():
            byid.setdefault(rid,{"referee_id":rid})
            byid[rid]['web_path']=f'faces/web_1024/{rid}.webp'
    mp.write_text(json.dumps(sorted(byid.values(),key=lambda x:int(x['referee_id'])),ensure_ascii=False,indent=2),encoding='utf-8')

    # Actualiza master y by_referee face_web_path
    masterp=ROOT/'referees_master.json'; master=json.loads(masterp.read_text(encoding='utf-8-sig'))
    ready=0
    for ref in master.get('referees',[]):
        rid=int(ref['referee_id']); wp=web/f'{rid}.webp'
        ref['face_web_path']=f'faces/web_1024/{rid}.webp' if wp.exists() else None
        if wp.exists(): ready+=1
        br=ROOT/'by_referee'/f'{rid}.json'
        if br.exists():
            d=json.loads(br.read_text(encoding='utf-8-sig')); d['face_web_path']=ref['face_web_path']; br.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
    master.setdefault('faces',{})['web_count']=ready
    master['faces']['enhancer']='Real-ESRGAN x4plus -> WebP 1024'
    master['faces']['enhanced_at']=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    masterp.write_text(json.dumps(master,ensure_ascii=False,indent=2),encoding='utf-8')

    report={"schema_version":"incastats.referee_faces.esrgan_turbo.v1","originals":len(imgs),"web_1024_ready":ready,"processed_this_run":len(pending),"engine":"realesrgan-x4plus","output":"faces/web_1024/{id}.webp"}
    (ROOT/'audit'/'REAL_ESRGAN_REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    outzip=ROOT.parent/'TITAN_REFEREES_CURRENT_GITHUB_READY_HD.zip'
    pack(ROOT,outzip)
    print('\n============================================================')
    print(' LISTO · CARAS HD:',ready)
    print(' ZIP FINAL GITHUB:',outzip)
    print('============================================================')
    return 0

if __name__=='__main__':
    raise SystemExit(main())
