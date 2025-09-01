from PIL import Image, ImageOps
import os
import math
import zipfile

DPI = 300
A4_WIDTH_MM = 210
A4_HEIGHT_MM = 297
SAFE_MARGIN_MM = 5

def mm_to_pixels(mm, dpi=300):
    return int((mm / 25.4) * dpi)

def resize_with_aspect_ratio(image, target_width_px, target_height_px):
    white_background = Image.new('RGB', (target_width_px, target_height_px), 'white')
    original_image = image.copy()
    original_image.thumbnail((target_width_px, target_height_px), Image.Resampling.LANCZOS)
    paste_x = (target_width_px - original_image.width) // 2
    paste_y = (target_height_px - original_image.height) // 2
    white_background.paste(original_image, (paste_x, paste_y))
    return white_background

def resize_with_stretch(image, target_width_px, target_height_px):
    if image.mode in ('RGBA', 'P'):
        image = image.convert('RGB')
    return image.resize((target_width_px, target_height_px), Image.Resampling.LANCZOS)

def calculate_layout_plan(card_width_mm, card_height_mm, add_border=True):
    card_width_px = mm_to_pixels(card_width_mm)
    card_height_px = mm_to_pixels(card_height_mm)
    border_px = 1 if add_border else 0
    slot_width_px = card_width_px + (border_px * 2)
    slot_height_px = card_height_px + (border_px * 2)

    a4_portrait_px = (mm_to_pixels(A4_WIDTH_MM), mm_to_pixels(A4_HEIGHT_MM))
    margin_px = mm_to_pixels(SAFE_MARGIN_MM)
    usable_area_portrait = (a4_portrait_px[0] - margin_px * 2, a4_portrait_px[1] - margin_px * 2)
    usable_area_landscape = (a4_portrait_px[1] - margin_px * 2, a4_portrait_px[0] - margin_px * 2)

    cols_portrait = usable_area_portrait[0] // slot_width_px if slot_width_px > 0 else 0
    rows_portrait = usable_area_portrait[1] // slot_height_px if slot_height_px > 0 else 0
    total_portrait = cols_portrait * rows_portrait
    
    cols_landscape = usable_area_landscape[0] // slot_width_px if slot_width_px > 0 else 0
    rows_landscape = usable_area_landscape[1] // slot_height_px if slot_height_px > 0 else 0
    total_landscape = cols_landscape * rows_landscape

    plan = {}
    if total_landscape > total_portrait:
        plan['orientation'] = 'landscape'
        plan['a4_final_px'] = (a4_portrait_px[1], a4_portrait_px[0])
        plan['cols'] = cols_landscape
        plan['rows'] = rows_landscape
    else:
        plan['orientation'] = 'portrait'
        plan['a4_final_px'] = a4_portrait_px
        plan['cols'] = cols_portrait
        plan['rows'] = rows_portrait
    
    if plan['cols'] == 0 or plan['rows'] == 0:
        return None

    plan['cards_per_sheet'] = plan['cols'] * plan['rows']
    return plan

def create_print_sheets(layout_plan, image_path_list, card_width_mm, card_height_mm, stretch_to_fit=False, add_border=True):
    total_images = len(image_path_list)
    card_width_px = mm_to_pixels(card_width_mm)
    card_height_px = mm_to_pixels(card_height_mm)
    border_px = 1 if add_border else 0
    slot_width_px = card_width_px + (border_px * 2)
    slot_height_px = card_height_px + (border_px * 2)
    
    cols = layout_plan['cols']
    rows = layout_plan['rows']
    CARDS_PER_SHEET = layout_plan['cards_per_sheet']
    a4_final_px = layout_plan['a4_final_px']
    total_sheets = math.ceil(total_images / CARDS_PER_SHEET)
    
    grid_total_width = cols * slot_width_px
    grid_total_height = rows * slot_height_px
    offset_x = (a4_final_px[0] - grid_total_width) // 2
    offset_y = (a4_final_px[1] - grid_total_height) // 2

    generated_sheets = []
    for i in range(total_sheets):
        a4_sheet = Image.new('RGB', a4_final_px, 'white')
        slice_start = i * CARDS_PER_SHEET
        slice_end = slice_start + CARDS_PER_SHEET
        images_for_this_sheet = image_path_list[slice_start:slice_end]
        for j, image_path in enumerate(images_for_this_sheet):
            try:
                original_image = Image.open(image_path)
                if stretch_to_fit:
                    processed_card = resize_with_stretch(original_image, card_width_px, card_height_px)
                else:
                    processed_card = resize_with_aspect_ratio(original_image, card_width_px, card_height_px)
                
                if add_border:
                    image_to_paste = ImageOps.expand(processed_card, border=border_px, fill='lightgray')
                else:
                    image_to_paste = processed_card
                    
                row = j // cols
                column = j % cols
                pos_x = offset_x + (column * slot_width_px)
                pos_y = offset_y + (row * slot_height_px)
                a4_sheet.paste(image_to_paste, (pos_x, pos_y))
            except Exception as e:
                print(f"Error processing image {image_path}: {e}")
                continue
        generated_sheets.append(a4_sheet)
    
    return generated_sheets

def create_pdf_from_images(image_object_list, output_path):
    if not image_object_list:
        return

    rgb_ready_images = []
    for img in image_object_list:
        if img.mode == 'RGB':
            rgb_ready_images.append(img)
        elif img.mode == 'RGBA':
            white_background = Image.new('RGB', img.size, (255, 255, 255))
            white_background.paste(img, mask=img.getchannel('A'))
            rgb_ready_images.append(white_background)
        else:
            rgb_ready_images.append(img.convert('RGB'))

    if not rgb_ready_images:
        return
        
    first_image = rgb_ready_images[0]
    other_images = rgb_ready_images[1:]

    if not other_images:
        first_image.save(output_path, "PDF", resolution=DPI)
    else:
        first_image.save(
            output_path,
            "PDF",
            resolution=DPI,
            save_all=True,
            append_images=other_images
        )

def create_zip_from_files(path_list, output_path):
    with zipfile.ZipFile(output_path, 'w') as zipf:
        for file_path in path_list:
            zipf.write(file_path, os.path.basename(file_path))