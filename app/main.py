import os
import threading
import time
import shutil
import math
import sys
import json
import uuid
import subprocess
from datetime import datetime, timezone
from flask import Flask, request, jsonify, send_from_directory
import webview
from werkzeug.utils import secure_filename
import image_processor


# ─────────────────────────────────────────────────────────────
#  Paths — portable-friendly
# ─────────────────────────────────────────────────────────────

def _resource_dir():
    """Directory where bundled resources (gui/) live."""
    if getattr(sys, 'frozen', False):
        return getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def _data_dir():
    """Per-user writable directory for settings, projects, temp."""
    if sys.platform == 'win32':
        base = os.environ.get('APPDATA') or os.path.expanduser('~')
        path = os.path.join(base, 'LayoutForge')
    elif sys.platform == 'darwin':
        path = os.path.expanduser('~/Library/Application Support/LayoutForge')
    else:
        base = os.environ.get('XDG_DATA_HOME') or os.path.expanduser('~/.local/share')
        path = os.path.join(base, 'LayoutForge')
    os.makedirs(path, exist_ok=True)
    return path


RESOURCE_DIR   = _resource_dir()
DATA_DIR       = _data_dir()
PROJECTS_FOLDER = os.path.join(DATA_DIR, 'projects')
TEMP_FOLDER     = os.path.join(DATA_DIR, 'temp')
SETTINGS_FILE   = os.path.join(DATA_DIR, 'settings.json')
GUI_DIR         = os.path.join(RESOURCE_DIR, 'gui')

for _d in (PROJECTS_FOLDER, TEMP_FOLDER):
    os.makedirs(_d, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp'}


# ─────────────────────────────────────────────────────────────
#  Settings
# ─────────────────────────────────────────────────────────────

def _default_save_dir():
    downloads = os.path.join(os.path.expanduser('~'), 'Downloads')
    if os.path.isdir(downloads):
        return downloads
    return os.path.expanduser('~')


def load_settings():
    defaults = {'last_save_dir': _default_save_dir()}
    if os.path.isfile(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict):
                defaults.update(data)
        except Exception as e:
            print(f'settings load failed: {e}')
    return defaults


def save_settings(s):
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(s, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f'settings save failed: {e}')


# ─────────────────────────────────────────────────────────────
#  Flask app
# ─────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder=GUI_DIR, static_url_path='')
try:
    from flask_cors import CORS
    CORS(app)
except ImportError:
    pass

app.config['PROJECTS_FOLDER'] = PROJECTS_FOLDER
app.config['TEMP_FOLDER'] = TEMP_FOLDER


# ─────────────────────────────────────────────────────────────
#  Native bridge (pywebview)
# ─────────────────────────────────────────────────────────────

def _first_of(result):
    if result is None:
        return None
    if isinstance(result, (list, tuple)):
        return result[0] if result else None
    return result


class JsApi:
    def __init__(self):
        self.window = None

    def set_window(self, w):
        self.window = w

    def pick_images(self):
        if not self.window:
            return []
        try:
            result = self.window.create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=True,
                file_types=('Images (*.png;*.jpg;*.jpeg;*.bmp)', 'All files (*.*)')
            )
            return list(result) if result else []
        except Exception as e:
            print('pick_images failed:', e)
            return []

    def pick_folder(self):
        if not self.window:
            return None
        try:
            result = self.window.create_file_dialog(webview.FOLDER_DIALOG)
            return _first_of(result)
        except Exception as e:
            print('pick_folder failed:', e)
            return None

    def save_file(self, temp_path, suggested_name, kind='pdf'):
        if not self.window:
            return {'ok': False, 'error': 'Window not ready.'}
        if not temp_path or not os.path.isfile(temp_path):
            return {'ok': False, 'error': 'Generated file is missing.'}

        settings = load_settings()
        default_dir = settings.get('last_save_dir') or _default_save_dir()
        if not os.path.isdir(default_dir):
            default_dir = _default_save_dir()

        filters = {
            'pdf': ('PDF document (*.pdf)',),
            'jpg': ('JPEG image (*.jpg)',),
            'zip': ('ZIP archive (*.zip)',),
        }.get(kind, ('All files (*.*)',))

        try:
            result = self.window.create_file_dialog(
                webview.SAVE_DIALOG,
                directory=default_dir,
                save_filename=suggested_name,
                file_types=filters,
            )
        except Exception as e:
            print('save_file dialog failed:', e)
            return {'ok': False, 'error': f'Dialog failed: {e}'}

        target = _first_of(result)
        if not target:
            return {'ok': False, 'cancelled': True}

        ext = os.path.splitext(suggested_name)[1].lower()
        if ext and not target.lower().endswith(ext):
            target = target + ext

        try:
            shutil.copyfile(temp_path, target)
            try:
                os.remove(temp_path)
            except OSError:
                pass
            settings['last_save_dir'] = os.path.dirname(target)
            save_settings(settings)
            return {'ok': True, 'path': target}
        except Exception as e:
            print('save_file copy failed:', e)
            return {'ok': False, 'error': f'Could not save: {e}'}

    def reveal_path(self, path):
        if not path or not os.path.exists(path):
            return {'ok': False}
        try:
            if sys.platform == 'win32':
                if os.path.isfile(path):
                    subprocess.Popen(['explorer', '/select,', os.path.normpath(path)])
                else:
                    os.startfile(os.path.realpath(path))
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', '-R', path] if os.path.isfile(path) else ['open', path])
            else:
                subprocess.Popen(['xdg-open', os.path.dirname(path) if os.path.isfile(path) else path])
            return {'ok': True}
        except Exception as e:
            print('reveal failed:', e)
            return {'ok': False, 'error': str(e)}


api = JsApi()


# ─────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def open_folder_native(path):
    try:
        if sys.platform == 'win32':
            os.startfile(os.path.realpath(path))
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', path])
        else:
            subprocess.Popen(['xdg-open', path])
    except Exception as e:
        print(f'open_folder failed: {e}')


def _now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def _project_file(pid):
    return os.path.join(PROJECTS_FOLDER, f'{pid}.json')


def _load_project(pid):
    fp = _project_file(pid)
    if not os.path.isfile(fp):
        return None
    try:
        with open(fp, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f'load project {pid} failed: {e}')
        return None


def _save_project(proj):
    proj['updated_at'] = _now_iso()
    with open(_project_file(proj['id']), 'w', encoding='utf-8') as f:
        json.dump(proj, f, indent=2, ensure_ascii=False)


def _scan_folder(folder, recursive, extensions):
    if not folder or not os.path.isdir(folder):
        return []
    exts = {e.lower().lstrip('.') for e in extensions}
    found = []
    if recursive:
        for root, _, files in os.walk(folder):
            for f in files:
                if '.' in f and f.rsplit('.', 1)[-1].lower() in exts:
                    found.append(os.path.join(root, f))
    else:
        try:
            for f in os.listdir(folder):
                fp = os.path.join(folder, f)
                if os.path.isfile(fp) and '.' in f and f.rsplit('.', 1)[-1].lower() in exts:
                    found.append(fp)
        except OSError as e:
            print(f'scan failed: {e}')
    return sorted(found, key=lambda p: os.path.basename(p).lower())


def _resolve_project_files(proj):
    source = proj.get('source', {})
    mode = source.get('mode', 'manual')
    order = proj.get('order', []) or []
    hidden = set(proj.get('hidden', []) or [])

    if mode == 'folder':
        folder = source.get('folder')
        recursive = source.get('recursive', False)
        exts = source.get('extensions', ['png', 'jpg', 'jpeg', 'bmp'])
        scanned = _scan_folder(folder, recursive, exts)
        hidden = {h for h in hidden if os.path.exists(h)}
        kept = [p for p in order if os.path.exists(p) and p not in hidden]
        kept_set = set(kept)
        new = [p for p in scanned if p not in kept_set and p not in hidden]
        final = kept + new
    else:
        final = list(order)

    existing = [p for p in final if os.path.isfile(p)]
    missing = [p for p in final if not os.path.isfile(p)]
    return existing, missing


def _project_summary(proj):
    existing, _ = _resolve_project_files(proj)
    return {
        'id': proj['id'],
        'name': proj.get('name', 'Untitled'),
        'source_mode': proj.get('source', {}).get('mode', 'manual'),
        'folder': proj.get('source', {}).get('folder'),
        'file_count': len(existing),
        'created_at': proj.get('created_at'),
        'updated_at': proj.get('updated_at'),
    }


def _project_detail(proj):
    existing, missing = _resolve_project_files(proj)
    copies = proj.get('copies', {}) or {}
    items = []
    for p in existing:
        items.append({'path': p, 'name': os.path.basename(p),
                      'copies': copies.get(p, 1), 'missing': False})
    for p in missing:
        items.append({'path': p, 'name': os.path.basename(p),
                      'copies': copies.get(p, 1), 'missing': True})
    return {
        'id': proj['id'],
        'name': proj.get('name', 'Untitled'),
        'source': proj.get('source', {}),
        'options': proj.get('options', {}),
        'items': items,
        'created_at': proj.get('created_at'),
        'updated_at': proj.get('updated_at'),
    }


# ─────────────────────────────────────────────────────────────
#  Routes — static & info
# ─────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/api/app-info', methods=['GET'])
def app_info():
    return jsonify({
        'data_dir': DATA_DIR,
        'projects_dir': PROJECTS_FOLDER,
        'frozen': bool(getattr(sys, 'frozen', False)),
        'settings': load_settings(),
    })


@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(load_settings())


@app.route('/api/settings', methods=['PATCH'])
def patch_settings():
    s = load_settings()
    data = request.get_json(silent=True) or {}
    if isinstance(data.get('last_save_dir'), str):
        s['last_save_dir'] = data['last_save_dir']
    save_settings(s)
    return jsonify(s)


@app.route('/open-folder', methods=['POST'])
def open_results_folder():
    try:
        open_folder_native(DATA_DIR)
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/downloads/<path:filename>')
def download_file(filename):
    """Fallback for browser/dev usage without pywebview."""
    return send_from_directory(os.path.join(TEMP_FOLDER, 'output'), filename, as_attachment=True)


# ─────────────────────────────────────────────────────────────
#  Preview
# ─────────────────────────────────────────────────────────────

@app.route('/preview-layout', methods=['POST'])
def preview_layout():
    if 'files[]' not in request.files:
        return jsonify({'error': 'No files were uploaded'}), 400
    files = request.files.getlist('files[]')
    try:
        card_width = float(request.form['card_width_mm'])
        card_height = float(request.form['card_height_mm'])
        stretch_to_fit = request.form.get('stretch_to_fit') == 'true'
        add_border = request.form.get('add_border') == 'true'
    except (KeyError, ValueError):
        return jsonify({'error': 'Invalid card dimensions'}), 400

    upload_stage = os.path.join(TEMP_FOLDER, 'uploads')
    if os.path.isdir(upload_stage):
        shutil.rmtree(upload_stage, ignore_errors=True)
    os.makedirs(upload_stage, exist_ok=True)

    saved_paths = []
    for file in files:
        if file and allowed_file(file.filename):
            filename = f'{int(time.time()*1000)}_{secure_filename(file.filename)}'
            filepath = os.path.join(upload_stage, filename)
            file.save(filepath)
            saved_paths.append(filepath)

    if not saved_paths:
        return jsonify({'error': 'No valid image files provided'}), 400

    try:
        layout_plan = image_processor.calculate_layout_plan(card_width, card_height, add_border)
        if not layout_plan:
            return jsonify({'error': 'Image is larger than A4 sheet.'}), 400
        return jsonify({
            'mode': 'quick',
            'layout_info': layout_plan,
            'image_paths': saved_paths,
            'options': {
                'card_width_mm': card_width,
                'card_height_mm': card_height,
                'stretch_to_fit': stretch_to_fit,
                'add_border': add_border,
            },
            'num_sheets': math.ceil(len(saved_paths) / layout_plan['cards_per_sheet']),
            'missing': [],
        })
    except Exception as e:
        return jsonify({'error': f'Layout error: {e}'}), 500


@app.route('/api/preview-from-paths', methods=['POST'])
def preview_from_paths():
    data = request.get_json(silent=True) or {}
    paths = data.get('paths', [])
    options = data.get('options', {})

    try:
        card_width = float(options['card_width_mm'])
        card_height = float(options['card_height_mm'])
    except (KeyError, TypeError, ValueError):
        return jsonify({'error': 'Invalid card dimensions'}), 400

    stretch_to_fit = bool(options.get('stretch_to_fit'))
    add_border = bool(options.get('add_border', True))

    valid = [p for p in paths if os.path.isfile(p)]
    missing = [p for p in paths if not os.path.isfile(p)]

    if not valid:
        return jsonify({'error': 'No valid image files were found on disk.'}), 400

    try:
        layout_plan = image_processor.calculate_layout_plan(card_width, card_height, add_border)
        if not layout_plan:
            return jsonify({'error': 'Card is larger than A4 sheet.'}), 400
        return jsonify({
            'mode': 'project',
            'layout_info': layout_plan,
            'image_paths': valid,
            'options': {
                'card_width_mm': card_width,
                'card_height_mm': card_height,
                'stretch_to_fit': stretch_to_fit,
                'add_border': add_border,
            },
            'num_sheets': math.ceil(len(valid) / layout_plan['cards_per_sheet']),
            'missing': missing,
        })
    except Exception as e:
        return jsonify({'error': f'Layout error: {e}'}), 500


# ─────────────────────────────────────────────────────────────
#  Projects
# ─────────────────────────────────────────────────────────────

@app.route('/api/projects', methods=['GET'])
def list_projects():
    projects = []
    try:
        for name in os.listdir(PROJECTS_FOLDER):
            if not name.endswith('.json'):
                continue
            pid = name[:-5]
            proj = _load_project(pid)
            if not proj:
                continue
            try:
                projects.append(_project_summary(proj))
            except Exception as e:
                print(f'bad project {pid}: {e}')
    except OSError as e:
        print(f'list projects failed: {e}')
    projects.sort(key=lambda p: p.get('updated_at') or '', reverse=True)
    return jsonify(projects)


@app.route('/api/projects', methods=['POST'])
def create_project():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or 'Untitled').strip() or 'Untitled'
    source = data.get('source', {}) or {}
    mode = source.get('mode', 'manual')
    if mode not in ('manual', 'folder'):
        return jsonify({'error': 'Invalid source mode.'}), 400

    pid = 'p_' + uuid.uuid4().hex[:12]
    proj = {
        'id': pid,
        'name': name,
        'created_at': _now_iso(),
        'updated_at': _now_iso(),
        'source': {
            'mode': mode,
            'folder': source.get('folder'),
            'recursive': bool(source.get('recursive', False)),
            'extensions': source.get('extensions', ['png', 'jpg', 'jpeg', 'bmp']),
        },
        'order': [],
        'hidden': [],
        'copies': {},
        'options': {
            'card_width_mm': 63,
            'card_height_mm': 88,
            'stretch_to_fit': False,
            'add_border': True,
        },
    }

    if mode == 'folder':
        folder = proj['source']['folder']
        if not folder or not os.path.isdir(folder):
            return jsonify({'error': 'Folder does not exist.'}), 400
        proj['order'] = _scan_folder(
            folder, proj['source']['recursive'], proj['source']['extensions']
        )

    _save_project(proj)
    return jsonify(_project_detail(proj))


@app.route('/api/projects/<pid>', methods=['GET'])
def get_project(pid):
    proj = _load_project(pid)
    if not proj:
        return jsonify({'error': 'Project not found.'}), 404
    existing, _ = _resolve_project_files(proj)
    proj['order'] = existing
    _save_project(proj)
    return jsonify(_project_detail(proj))


@app.route('/api/projects/<pid>', methods=['PATCH'])
def update_project(pid):
    proj = _load_project(pid)
    if not proj:
        return jsonify({'error': 'Project not found.'}), 404
    data = request.get_json(silent=True) or {}

    if 'name' in data:
        proj['name'] = (data['name'] or 'Untitled').strip() or 'Untitled'

    if 'source' in data:
        s = data['source'] or {}
        old_mode = proj.get('source', {}).get('mode')
        old_folder = proj.get('source', {}).get('folder')
        proj['source'] = {
            'mode': s.get('mode', old_mode or 'manual'),
            'folder': s.get('folder', old_folder),
            'recursive': bool(s.get('recursive', proj.get('source', {}).get('recursive', False))),
            'extensions': s.get('extensions', proj.get('source', {}).get('extensions',
                                                                            ['png', 'jpg', 'jpeg', 'bmp'])),
        }
        new_mode = proj['source']['mode']
        new_folder = proj['source']['folder']
        if new_mode == 'folder' and (old_mode != 'folder' or old_folder != new_folder):
            proj['order'] = _scan_folder(
                new_folder, proj['source']['recursive'], proj['source']['extensions']
            )
            proj['hidden'] = []

    if 'order' in data:
        proj['order'] = list(data['order'])
    if 'hidden' in data:
        proj['hidden'] = list(data['hidden'])
    if 'copies' in data:
        proj['copies'] = dict(data['copies'])
    if 'options' in data:
        proj['options'] = dict(data['options'])

    _save_project(proj)
    return jsonify(_project_detail(proj))


@app.route('/api/projects/<pid>', methods=['DELETE'])
def delete_project(pid):
    fp = _project_file(pid)
    if os.path.isfile(fp):
        os.remove(fp)
        return jsonify({'ok': True})
    return jsonify({'error': 'Project not found.'}), 404


@app.route('/api/projects/<pid>/rescan', methods=['POST'])
def rescan_project(pid):
    proj = _load_project(pid)
    if not proj:
        return jsonify({'error': 'Project not found.'}), 404
    existing, _ = _resolve_project_files(proj)
    proj['order'] = existing
    _save_project(proj)
    return jsonify(_project_detail(proj))


# ─────────────────────────────────────────────────────────────
#  Generate — produces temp file; JS then shows save dialog
# ─────────────────────────────────────────────────────────────

@app.route('/generate-file', methods=['POST'])
def generate_file():
    data = request.get_json()
    plan = data.get('plan')
    requested_format = data.get('format')
    if not plan or not requested_format:
        return jsonify({'error': 'Plan data or format missing'}), 400

    image_paths = plan['image_paths']
    options = plan['options']
    layout_info = plan['layout_info']

    try:
        sheets_in_memory = image_processor.create_print_sheets(
            layout_plan=layout_info,
            image_path_list=image_paths,
            card_width_mm=options['card_width_mm'],
            card_height_mm=options['card_height_mm'],
            stretch_to_fit=options['stretch_to_fit'],
            add_border=options['add_border'],
        )

        staging = os.path.join(TEMP_FOLDER, 'output')
        os.makedirs(staging, exist_ok=True)
        for name in os.listdir(staging):
            try:
                p = os.path.join(staging, name)
                if os.path.isfile(p):
                    os.remove(p)
            except OSError:
                pass

        base_name = f"layout_{int(time.time())}"
        temp_path = ''
        suggested_name = ''

        if requested_format == 'pdf':
            suggested_name = f"{base_name}_complete.pdf"
            temp_path = os.path.join(staging, suggested_name)
            image_processor.create_pdf_from_images(sheets_in_memory, temp_path)
        elif requested_format in ('jpg', 'zip'):
            generated_jpg_paths = []
            for i, sheet_img in enumerate(sheets_in_memory):
                jpg_filename = f"{base_name}_sheet_{i+1:02d}.jpg"
                jpg_output_path = os.path.join(staging, jpg_filename)
                sheet_img.save(jpg_output_path, 'JPEG', quality=95, dpi=(300, 300))
                generated_jpg_paths.append(jpg_output_path)
            if requested_format == 'jpg':
                temp_path = generated_jpg_paths[0]
                suggested_name = os.path.basename(temp_path)
            else:
                zip_filename = f"{base_name}_pack.zip"
                zip_output_path = os.path.join(staging, zip_filename)
                image_processor.create_zip_from_files(generated_jpg_paths, zip_output_path)
                temp_path = zip_output_path
                suggested_name = zip_filename

        return jsonify({
            'temp_path': temp_path,
            'suggested_name': suggested_name,
            'kind': requested_format,
        })
    except Exception as e:
        return jsonify({"error": f"An error occurred during file generation: {e}"}), 500


# ─────────────────────────────────────────────────────────────
#  Entry
# ─────────────────────────────────────────────────────────────

def run_server():
    app.run(host='127.0.0.1', port=5000)


def shutdown():
    print("Window closed. Exiting…")
    os._exit(0)


if __name__ == '__main__':
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    window = webview.create_window(
        'LayoutForge',
        'http://127.0.0.1:5000',
        width=1280,
        height=820,
        min_size=(960, 640),
        js_api=api,
    )
    api.set_window(window)
    window.events.closed += shutdown

    webview.start(debug=False)