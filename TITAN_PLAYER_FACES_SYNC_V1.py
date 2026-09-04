from __future__ import annotations
import io, json, os, re, shutil, subprocess, sys, tempfile, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

APP_NAME = "INCASTATS"
ZIP_GLOB = "INCASTATS_PLAYER_FACES_RAW_*.zip"
ESRGAN_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.3.0/realesrgan-ncnn-vulkan-20211212-windows.zip"
WEB_SIZE = 1024
BATCH_AI = 500

def utcnow():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def ensure_pillow():
    try:
        from PIL import Image  # noqa
        return
    except Exception:
        print("[SETUP] Pillow no esta instalado. Instalando...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "pillow"])

def get_image_module():
    ensure_pillow()
    from PIL import Image, ImageFilter
    return Image, ImageFilter

def local_base() -> Path:
    p = os.environ.get("LOCALAPPDATA")
    if p:
        return Path(p) / APP_NAME
    return Path.home() / ".incastats"

def downloads_dirs():
    out=[]
    home=Path.home()
    for p in [home/"Downloads", home/"Descargas"]:
        if p.exists() and p not in out: out.append(p)
    return out

def find_raw_zips():
    files=[]
    for d in downloads_dirs():
        files += list(d.glob(ZIP_GLOB))
        # Algunos navegadores guardan en una subcarpeta elegida por el usuario.
        try:
            for sub in d.iterdir():
                if sub.is_dir(): files += list(sub.glob(ZIP_GLOB))
        except Exception: pass
    uniq={str(p.resolve()).lower():p for p in files if p.is_file()}
    return sorted(uniq.values(), key=lambda p:(p.stat().st_mtime,p.name))

def state_path():
    p=local_base();p.mkdir(parents=True,exist_ok=True);return p/"player_faces_sync_state.json"

def load_state():
    p=state_path()
    try:return json.loads(p.read_text(encoding="utf-8"))
    except:return {"schema_version":"incastats.player_faces_sync_state.v1","processed":{}}

def save_state(s):
    state_path().write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding="utf-8")

def zip_sig(p:Path):
    st=p.stat();return f"{p.name}|{st.st_size}|{int(st.st_mtime)}"

def repo_root():
    root=Path(__file__).resolve().parent
    if not (root/".git").exists():
        print("[AVISO] No veo .git junto al BAT/PY. Igual usare esta carpeta como raiz:")
        print("       ",root)
    return root

def ensure_esrgan():
    root=local_base()/"RealESRGAN"
    exe=next(root.rglob("realesrgan-ncnn-vulkan.exe"),None) if root.exists() else None
    if exe and exe.exists():return exe
    print("[SETUP] Real-ESRGAN NCNN no esta instalado localmente.")
    print("[SETUP] Descargando paquete oficial (~75 MB) a LOCALAPPDATA, NO al repo...")
    root.mkdir(parents=True,exist_ok=True)
    zfile=root/"realesrgan_windows.zip"
    try:
        urllib.request.urlretrieve(ESRGAN_URL,zfile)
        with zipfile.ZipFile(zfile) as z:z.extractall(root)
        try:zfile.unlink()
        except:pass
    except Exception as e:
        raise RuntimeError(f"No pude instalar Real-ESRGAN automaticamente: {e}")
    exe=next(root.rglob("realesrgan-ncnn-vulkan.exe"),None)
    if not exe:raise RuntimeError("Real-ESRGAN se descargo pero no encuentro realesrgan-ncnn-vulkan.exe")
    return exe

def valid_image(data:bytes):
    Image,_=get_image_module()
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.verify()
        with Image.open(io.BytesIO(data)) as im:
            return im.width>=40 and im.height>=40
    except:return False

def square_1024(src:Path,dst:Path):
    Image,ImageFilter=get_image_module()
    with Image.open(src) as im:
        im=im.convert("RGBA")
        side=max(im.size)
        canvas=Image.new("RGBA",(side,side),(0,0,0,0))
        canvas.paste(im,((side-im.width)//2,(side-im.height)//2),im)
        canvas=canvas.resize((WEB_SIZE,WEB_SIZE),Image.Resampling.LANCZOS)
        canvas=canvas.filter(ImageFilter.UnsharpMask(radius=.6,percent=105,threshold=3))
        dst.parent.mkdir(parents=True,exist_ok=True)
        canvas.save(dst,"WEBP",quality=90,method=6)

def parse_zip(zp:Path,raw_dir:Path,names:dict):
    ids=[];issues=[]
    with zipfile.ZipFile(zp) as z:
        manifest=None
        if "PLAYER_FACES_RAW_MANIFEST.json" in z.namelist():
            try:manifest=json.loads(z.read("PLAYER_FACES_RAW_MANIFEST.json").decode("utf-8-sig"))
            except Exception as e:issues.append({"zip":zp.name,"reason":f"manifest: {e}"})
        if manifest:
            for x in manifest.get("players",[]):
                try:names[int(x.get("player_id"))]=str(x.get("name") or "")
                except:pass
        for n in z.namelist():
            m=re.search(r"(?:^|/)(\d+)\.(png|jpg|jpeg|webp)$",n,re.I)
            if not m:continue
            pid=int(m.group(1));data=z.read(n)
            if not valid_image(data):
                issues.append({"zip":zp.name,"player_id":pid,"reason":"imagen invalida"});continue
            ext=m.group(2).lower();target=raw_dir/f"{pid}.{ext}";target.write_bytes(data);ids.append(pid)
    return sorted(set(ids)),issues

def run_esrgan_dir(exe:Path,input_dir:Path,output_dir:Path):
    output_dir.mkdir(parents=True,exist_ok=True)
    modeldir=exe.parent/"models"
    cmd=[str(exe),"-i",str(input_dir),"-o",str(output_dir),"-n","realesrgan-x4plus","-s","4","-m",str(modeldir),"-t","256","-f","png"]
    print("[AI] Real-ESRGAN:",len([p for p in input_dir.iterdir() if p.is_file()]),"faces")
    r=subprocess.run(cmd,cwd=exe.parent)
    if r.returncode!=0:raise RuntimeError(f"Real-ESRGAN termino con codigo {r.returncode}")

def rebuild_metadata(target:Path,names:dict,source_zips:list[str]):
    root=target.parent
    old_names={}
    old_map=root/"rutas_imagenes_players.json"
    if old_map.exists():
        try:
            old=json.loads(old_map.read_text(encoding="utf-8-sig"))
            for x in (old if isinstance(old,list) else old.get("players",[])):
                try: old_names[int(x.get("player_id",x.get("id")))]=str(x.get("name") or "")
                except: pass
        except: pass
    files=sorted(target.glob("*.webp"),key=lambda p:int(p.stem) if p.stem.isdigit() else 10**18)
    rows=[]
    for p in files:
        if not p.stem.isdigit():continue
        pid=int(p.stem);rows.append({"player_id":pid,"name":names.get(pid) or old_names.get(pid,""),"ruta":f"TITAN_PLAYERS_FACES_CURRENT/web_1024/{pid}.webp","archivo":p.name})
    (root/"rutas_imagenes_players.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
    manifest={"schema_version":"incastats.player_faces_current.v1","updated_at":utcnow(),"count":len(rows),"format":"webp","size":"1024x1024","source":"SofaScore player image -> Real-ESRGAN x4 -> WEBP 1024","path_template":"TITAN_PLAYERS_FACES_CURRENT/web_1024/{Player_ID}.webp","source_zips":source_zips}
    (root/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    return len(rows)

def main(skip_ai=False):
    root=repo_root();target=root/"TITAN_PLAYERS_FACES_CURRENT"/"web_1024";target.mkdir(parents=True,exist_ok=True)
    state=load_state();processed=state.setdefault("processed",{})
    zips=[p for p in find_raw_zips() if zip_sig(p) not in processed]
    print("==============================================================")
    print("  INCASTATS PLAYER FACES SYNC V1 - F12 -> REAL ESRGAN -> GIT")
    print("==============================================================")
    print("Repo:",root)
    print("Zips nuevos en Descargas:",len(zips))
    if not zips:
        print("No hay paquetes nuevos",ZIP_GLOB,"en Descargas.")
        return 0
    exe=None if skip_ai else ensure_esrgan()
    work=Path(tempfile.mkdtemp(prefix="incastats_player_faces_"));names={};all_issues=[];updated_ids=set();done_zips=[]
    try:
        for zi,zp in enumerate(zips,1):
            print(f"\n[ZIP {zi}/{len(zips)}] {zp.name}")
            raw=work/f"raw_{zi}";raw.mkdir()
            ids,issues=parse_zip(zp,raw,names);all_issues.extend(issues)
            if not ids:
                print("  Sin imagenes validas. No marco como procesado.")
                continue
            enhanced=work/f"enh_{zi}"
            if skip_ai:
                enhanced=raw
            else:
                run_esrgan_dir(exe,raw,enhanced)
            success=0
            for pid in ids:
                candidates=list(enhanced.glob(f"{pid}.*"))
                if not candidates:
                    all_issues.append({"zip":zp.name,"player_id":pid,"reason":"Real-ESRGAN no genero salida"});continue
                try:
                    square_1024(candidates[0],target/f"{pid}.webp");success+=1;updated_ids.add(pid)
                except Exception as e:all_issues.append({"zip":zp.name,"player_id":pid,"reason":str(e)})
            if success==len(ids):
                sig=zip_sig(zp);processed[sig]={"file":zp.name,"processed_at":utcnow(),"faces":success};done_zips.append(zp.name);save_state(state)
                print("  OK:",success,"faces actualizadas")
            else:
                print("  PARCIAL:",success,"/",len(ids),"- este ZIP NO queda confirmado para poder reintentar")
        final=rebuild_metadata(target,names,done_zips)
        report={"schema_version":"incastats.player_faces_sync_report.v1","created_at":utcnow(),"zips_confirmed":done_zips,"updated_faces":len(updated_ids),"final_faces":final,"issues":all_issues}
        (target.parent/"PLAYER_FACES_SYNC_REPORT.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
        print("\n==============================================================")
        print("LISTO")
        print("Faces actualizadas:",len(updated_ids))
        print("Faces finales en GitHub:",final)
        print("Issues:",len(all_issues))
        print("Ruta:",target.parent)
        print("==============================================================")
        try:
            chk=subprocess.run(["git","rev-parse","--is-inside-work-tree"],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if chk.returncode==0: subprocess.run(["git","status","--short","--","TITAN_PLAYERS_FACES_CURRENT"],cwd=root)
        except:pass
        return 0
    finally:
        shutil.rmtree(work,ignore_errors=True)

if __name__=="__main__":
    raise SystemExit(main(skip_ai="--skip-ai" in sys.argv))
