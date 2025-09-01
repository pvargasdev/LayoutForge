import os
import threading
import time
import shutil
import math
import sys
import subprocess
from flask import Flask, request, jsonify, send_from_directory
import webview
from werkzeug.utils import secure_filename
from flask_cors import CORS
import image_processor

UPLOAD_FOLDER = 'Input'
GENERATED_FOLDER = 'Output (Generated Files)'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(GENERATED_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder='gui', static_url_path='')
CORS(app)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['GENERATED_FOLDER'] = GENERATED_FOLDER

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def clear_folder_contents(folder_path):
    if not os.path.isdir(folder_path):
        os.makedirs(folder_path, exist_ok=True)
        return
        
    for item_name in os.listdir(folder_path):
        item_path = os.path.join(folder_path, item_name)
        try:
            if os.path.isfile(item_path) or os.path.islink(item_path):
                os.unlink(item_path)
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)
        except Exception as e:
            print(f"Failed to delete {item_path}. Reason: {e}")

def open_folder(path):
    if sys.platform == 'win32':
        os.startfile(os.path.realpath(path))
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', path])
    else:
        subprocess.Popen(['xdg-open', path])

@app.route('/open-folder', methods=['POST'])
def open_results_folder():
    try:
        folder_path = app.config['GENERATED_FOLDER']
        if os.path.isdir(folder_path):
            open_folder(folder_path)
            return jsonify({"status": "success", "message": f"Folder {folder_path} opened."}), 200
        else:
            return jsonify({"error": "Generated folder not found."}), 404
    except Exception as e:
        return jsonify({"error": f"Failed to open folder: {e}"}), 500

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/preview-layout', methods=['POST'])
def preview_layout():

    clear_folder_contents(app.config['UPLOAD_FOLDER'])
    
    if 'files[]' not in request.files: return jsonify({"error": "No files were uploaded"}), 400
    files = request.files.getlist('files[]')
    try:
        card_width = float(request.form['card_width_mm'])
        card_height = float(request.form['card_height_mm'])
        stretch_to_fit = request.form.get('stretch_to_fit') == 'true'
        add_border = request.form.get('add_border') == 'true'
    except (KeyError, ValueError):
        return jsonify({"error": "Invalid card dimensions"}), 400

    saved_files_paths = []
    for file in files:
        if file and allowed_file(file.filename):
            filename = f"{int(time.time())}_{secure_filename(file.filename)}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            saved_files_paths.append(filepath)

    if not saved_files_paths: return jsonify({"error": "No valid image files provided"}), 400
    
    try:
        layout_plan = image_processor.calculate_layout_plan(card_width, card_height, add_border)
        if not layout_plan: return jsonify({"error": "Image is larger than A4 sheet."}), 400
        final_plan = {
            'layout_info': layout_plan,
            'image_paths': saved_files_paths,
            'options': {
                'card_width_mm': card_width,
                'card_height_mm': card_height,
                'stretch_to_fit': stretch_to_fit,
                'add_border': add_border
            },
            'num_sheets': math.ceil(len(saved_files_paths) / layout_plan['cards_per_sheet'])
        }
        return jsonify(final_plan)
    except Exception as e:
        for path in saved_files_paths:
            if os.path.exists(path):
                os.remove(path)
        return jsonify({"error": f"An error occurred while calculating the layout: {e}"}), 500

@app.route('/generate-file', methods=['POST'])
def generate_file():
    data = request.get_json()
    plan = data.get('plan')
    requested_format = data.get('format')
    if not plan or not requested_format: return jsonify({"error": "Plan data or format missing"}), 400
    
    image_paths = plan['image_paths']
    options = plan['options']
    layout_info = plan['layout_info']
    
    try:
        sheets_in_memory = image_processor.create_print_sheets(
            layout_plan=layout_info, image_path_list=image_paths, card_width_mm=options['card_width_mm'], card_height_mm=options['card_height_mm'], stretch_to_fit=options['stretch_to_fit'], add_border=options['add_border']
        )
        base_name = f"layout_{int(time.time())}"
        download_url = ""
        
        if requested_format == 'pdf':
            pdf_filename = f"{base_name}_complete.pdf"
            output_path = os.path.join(app.config['GENERATED_FOLDER'], pdf_filename)
            image_processor.create_pdf_from_images(sheets_in_memory, output_path)
            download_url = f"/downloads/{pdf_filename}"

        elif requested_format == 'jpg':
            jpg_filename = f"{base_name}_sheet_01.jpg"
            jpg_output_path = os.path.join(app.config['GENERATED_FOLDER'], jpg_filename)
            sheets_in_memory[0].save(jpg_output_path, 'JPEG', quality=95, dpi=(300, 300))
            download_url = f"/downloads/{jpg_filename}"

        elif requested_format == 'zip':
            temp_dir_for_zip = os.path.join(app.config['GENERATED_FOLDER'], f"temp_{base_name}")
            os.makedirs(temp_dir_for_zip)
            try:
                generated_jpg_paths = []
                for i, sheet_img in enumerate(sheets_in_memory):
                    jpg_filename = f"{base_name}_sheet_{i+1:02d}.jpg"
                    jpg_output_path = os.path.join(temp_dir_for_zip, jpg_filename)
                    sheet_img.save(jpg_output_path, 'JPEG', quality=95, dpi=(300, 300))
                    generated_jpg_paths.append(jpg_output_path)
                
                zip_filename = f"{base_name}_pack.zip"
                zip_output_path = os.path.join(app.config['GENERATED_FOLDER'], zip_filename)
                image_processor.create_zip_from_files(generated_jpg_paths, zip_output_path)
                download_url = f"/downloads/{zip_filename}"
            finally:
                if os.path.isdir(temp_dir_for_zip):
                    shutil.rmtree(temp_dir_for_zip)
        
        return jsonify({"download_url": download_url})
    except Exception as e:
        return jsonify({"error": f"An error occurred during file generation: {e}"}), 500

@app.route('/downloads/<path:filename>')
def download_file(filename):
    return send_from_directory(app.config['GENERATED_FOLDER'], filename, as_attachment=True)

def run_server():
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(GENERATED_FOLDER, exist_ok=True)
    app.run(host='127.0.0.1', port=5000)

if __name__ == '__main__':
    server_thread = threading.Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()

    webview.create_window('Layout Forge', 'http://127.0.0.1:5000', width=1024, height=768)
    webview.start(debug=False)