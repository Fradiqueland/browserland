"""Rebrand the archived CID-font manual while retaining its page layout.

Requires pypdf, reportlab and Pillow. The original manual remains a reference;
the two-page update explicitly identifies the behavior introduced since 0.21.0.
Optional PDFium rendering provides visual checks without changing PDF content.
"""
from __future__ import annotations
import argparse
import ctypes
import io
import json
import re
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ByteStringObject, ContentStream, FloatObject, NameObject, TextStringObject
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle


def font_map(font):
    data = font['/ToUnicode'].get_object().get_data().decode('ascii')
    result = {}
    for block in re.findall(r'beginbfchar(.*?)endbfchar', data, re.S):
        for source, target in re.findall(r'<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>', block):
            result[int(source, 16)] = bytes.fromhex(target).decode('utf-16-be')
    for block in re.findall(r'beginbfrange(.*?)endbfrange', data, re.S):
        for first, last, target in re.findall(r'<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>\s*<([\dA-Fa-f]+)>', block):
            for cid in range(int(first, 16), int(last, 16) + 1):
                result[cid] = chr(int(target, 16) + cid - int(first, 16))
    return result


def glyph_width(font, cid):
    descendant = font['/DescendantFonts'][0].get_object()
    widths = descendant.get('/W', [])
    index = 0
    while index < len(widths):
        first = int(widths[index]); second = widths[index + 1]
        if isinstance(second, list):
            if first <= cid < first + len(second):
                return float(second[cid - first])
            index += 2
        else:
            if first <= cid <= int(second):
                return float(widths[index + 2])
            index += 3
    return float(descendant.get('/DW', 1000))


def rebrand_split_names(page, reader, fallback_fonts):
    """Join a brand split across lines without reshaping multilingual text.

    The archived PDF has seven names split between adjacent text objects.
    Move the complete new name to the second line and gently fit that line
    within its original width. All other glyph bytes and vertical positions
    remain unchanged, including the shaped Hindi and Bengali text.
    """
    fonts = {str(key): value.get_object() for key, value in page['/Resources']['/Font'].items()}
    maps = {key: font_map(font) for key, font in fonts.items()}
    stream = ContentStream(page['/Contents'], reader)
    blocks = []; block = []; font = None; size = 0
    line = [1., 0., 0., 1., 0., 0.]; position = line.copy()

    def width(run):
        return sum(glyph_width(fonts[run['font']], int.from_bytes(run['raw'][i:i+2], 'big'))
                   for i in range(0, len(run['raw']), 2)) * run['size'] / 1000

    for index, (arguments, operator) in enumerate(stream.operations):
        if operator == b'BT':
            block = []
        elif operator == b'Tf':
            font = str(arguments[0]); size = float(arguments[1])
        elif operator == b'Tm':
            line = list(map(float, arguments)); position = line.copy()
        elif operator == b'Td':
            dx, dy = map(float, arguments)
            line[4] += dx * line[0] + dy * line[2]
            line[5] += dx * line[1] + dy * line[3]
            position = line.copy()
        elif operator == b'Tj':
            raw = arguments[0].original_bytes
            decoded = ''.join(maps[font].get(int.from_bytes(raw[i:i+2], 'big'), '?')
                              for i in range(0, len(raw), 2))
            run = dict(index=index, raw=raw, text=decoded, font=font, size=size, matrix=position.copy())
            block.append(run)
            advance = width(run)
            position[4] += advance * position[0]; position[5] += advance * position[1]
        elif operator == b'ET' and block:
            blocks.append(dict(text=''.join(run['text'] for run in block), runs=block))

    def select(block, start, end):
        offsets = [run for run in block['runs'] for _ in run['text']]
        runs = list({run['index']: run for run in offsets[start:end]}.values())
        if ''.join(run['text'] for run in runs) != block['text'][start:end]:
            raise ValueError('Split brand boundary falls inside another text run')
        return runs

    replacements = {}; count = 0
    for block_index, (before, after) in enumerate(zip(blocks, blocks[1:])):
        if not before['text'].endswith('Multi-') or not after['text'].startswith('Browser'):
            continue
        old_prefix = select(before, len(before['text']) - 6, len(before['text']))
        old_suffix = select(after, 0, 7)
        first, last = old_suffix[0], old_suffix[-1]
        if abs(old_prefix[-1]['matrix'][5] - first['matrix'][5]) < first['size'] / 2:
            raise ValueError('Expected a line break inside the split brand')
        replacement_font = first['font']
        inverse = {value: key for key, value in maps[replacement_font].items()}
        if any(character not in inverse for character in 'Browserland'):
            style = 'bold' if 'Bold' in str(fonts[first['font']].get('/BaseFont')) else 'regular'
            replacement_font = '/BrowserlandBrand' + style.title()
            page['/Resources']['/Font'][NameObject(replacement_font)] = fallback_fonts[style]
            fonts[replacement_font] = fallback_fonts[style].get_object()
            maps[replacement_font] = font_map(fonts[replacement_font])
            inverse = {value: key for key, value in maps[replacement_font].items()}
        cids = [inverse[character] for character in 'Browserland']
        encoded = b''.join(cid.to_bytes(2, 'big') for cid in cids)
        new_width = sum(glyph_width(fonts[replacement_font], cid) for cid in cids) * first['size'] / 1000
        left = first['matrix'][4]
        old_width = last['matrix'][4] + width(last) * last['matrix'][0] - left
        delta = new_width * first['matrix'][0] - old_width
        line_runs = []
        for candidate in blocks[block_index + 1:]:
            if abs(candidate['runs'][0]['matrix'][5] - first['matrix'][5]) > first['size'] / 2:
                break
            line_runs.extend(candidate['runs'])
        right = max(run['matrix'][4] + width(run) * run['matrix'][0] for run in line_runs)
        scale = min(1., (right - left) / (right - left + delta))
        if scale < .9:
            raise ValueError('Split brand requires excessive line compression')
        for run in old_prefix + old_suffix[1:]:
            replacements[run['index']] = [([ByteStringObject(b'')], b'Tj')]
        for run in line_runs:
            if run in old_suffix[1:]:
                continue
            matrix = run['matrix'].copy()
            matrix[0] *= scale; matrix[2] *= scale
            shift = delta if run['index'] > last['index'] else 0
            matrix[4] = left + (matrix[4] - left + shift) * scale
            updated = [([FloatObject(value) for value in matrix], b'Tm')]
            if run is first:
                updated += [([NameObject(replacement_font), FloatObject(first['size'])], b'Tf'),
                            ([ByteStringObject(encoded)], b'Tj'),
                            ([NameObject(first['font']), FloatObject(first['size'])], b'Tf')]
            else:
                updated.append(stream.operations[run['index']])
            replacements[run['index']] = updated
        count += 1
    stream.operations = [operation for index, operation in enumerate(stream.operations)
                         for operation in replacements.get(index, [operation])]
    page.replace_contents(stream)
    return count


def rebrand_page(page, reader, fallback_fonts, cover=False):
    fonts = {str(key): value.get_object() for key, value in page['/Resources']['/Font'].items()}
    maps = {key: font_map(font) for key, font in fonts.items()}
    stream = ContentStream(page['/Contents'], reader)
    operations = stream.operations
    replacements = {}
    count = 0
    block = []
    font = None
    size = 0
    x = 0; y=0
    for index, (arguments, operator) in enumerate(operations):
        if operator == b'BT':
            block = []
        elif operator == b'Tf':
            font = str(arguments[0]); size = float(arguments[1])
        elif operator == b'Tm':
            x = float(arguments[4]);y=float(arguments[5])
        elif operator == b'Td':
            x += float(arguments[0]);y+=float(arguments[1])
        elif operator == b'Tj':
            raw = arguments[0].original_bytes
            decoded = ''.join(maps[font].get(int.from_bytes(raw[i:i+2], 'big'), '?') for i in range(0, len(raw), 2))
            block.append((index, raw, decoded, x, font, size,y))
        elif operator == b'ET':
            text = ''.join(item[2] for item in block)
            targets = [(m.start(), m.end(), 'Browserland') for m in re.finditer('Multi-Browser', text)]
            if cover and text == 'M' and size == 36:
                targets.append((0, 1, 'B'))
            offsets = []
            for item in block:
                offsets.extend([item] * len(item[2]))
            for start, end, replacement in targets:
                selected = list({item[0]:item for item in offsets[start:end]}.values())
                if ''.join(item[2] for item in selected) != text[start:end]:
                    raise ValueError('Brand boundary falls inside another text run')
                first, last = selected[0], selected[-1]
                if any(item[4:] != first[4:] for item in selected):
                    raise ValueError('Unexpected mixed font in brand')
                replacement_font=first[4]
                inverse = {value: key for key, value in maps[replacement_font].items()}
                if any(character not in inverse for character in replacement):
                    style='bold' if 'Bold' in str(fonts[first[4]].get('/BaseFont')) else 'regular'
                    replacement_font='/BrowserlandBrand'+style.title()
                    page['/Resources']['/Font'][NameObject(replacement_font)]=fallback_fonts[style]
                    fonts[replacement_font]=fallback_fonts[style].get_object()
                    maps[replacement_font]=font_map(fonts[replacement_font])
                    inverse={value:key for key,value in maps[replacement_font].items()}
                new_cids = [inverse[character] for character in replacement]
                last_width = sum(glyph_width(fonts[first[4]],int.from_bytes(last[1][i:i+2],'big')) for i in range(0,len(last[1]),2))
                old_width = last[3] - first[3] + last_width * first[5] / 1000
                new_width = sum(glyph_width(fonts[replacement_font], cid) for cid in new_cids) * first[5] / 1000
                encoded = b''.join(cid.to_bytes(2, 'big') for cid in new_cids)
                replacements[first[0]] = [([NameObject(replacement_font),FloatObject(first[5])],b'Tf'),([FloatObject(old_width / new_width * 100)], b'Tz'), ([ByteStringObject(encoded)], b'Tj'), ([FloatObject(100)], b'Tz'),([NameObject(first[4]),FloatObject(first[5])],b'Tf')]
                for item in selected[1:]:
                    replacements[item[0]] = [([ByteStringObject(b'')], b'Tj')]
                count += 1
    stream.operations = [operation for index, operation in enumerate(operations) for operation in replacements.get(index, [operation])]
    page.replace_contents(stream)
    return count


def update_note(size):
    output = io.BytesIO(); pdf = canvas.Canvas(output, pagesize=size)
    width, height = size
    note_pages = [
        ('EN', 'Read this update first', 'Browserland 0.22.0', [
            ('About this guide', 'The following 79 pages retain the eleven-language reference instructions from version 0.21.0, with the application name updated to Browserland. Those chapters are not a complete description of the current release. This update takes precedence where behavior has changed.'),
            ('One Open button', 'Chromium, Google Chrome and Microsoft Edge use the same Open button. Normal browsing is the default for new full-browser profiles and older full-browser profiles without a saved mode. The embedded Electron engine continues to use its customized mode.'),
            ('Sessions and profile settings', 'Normal browsing uses its own persistent session, separate from the original customized data. Choose With profile settings in the profile editor to access the original mode and data. Language, time zone, identity and API overrides apply only in customized mode. Explicit proxy routing is retained in normal browsing; application-managed proxy credentials require customized mode.'),
            ('Use the browser window', 'In normal browsing, manage tabs, history, bookmarks, extensions and downloads through the native browser. Use its Exit or Quit command before editing a profile. Manager actions that require debugging and session transfers are unavailable in normal mode.'),
            ('Install and update', 'Windows: close the application and profile windows, then run Browserland-0.22.0-Windows-Setup.exe. The installer detects an existing EXE installation and retains its data folder. macOS: extract the complete Mac package, keep the portable data folder and open Browserland.app. Existing session folders are not renamed or copied automatically.'),
            ('Files and validation limits', 'New exports use Browserland names and formats; older configuration and encrypted-session exports remain readable. Google login in the final integrated app, execution on a real Mac and live installer upgrade/uninstall still require manual confirmation. The Windows installer is unsigned and the Mac package is not notarized.')]),
        ('PT', 'Leia primeiro esta atualização', 'Browserland 0.22.0', [
            ('Sobre este manual', 'As 79 páginas seguintes conservam as instruções de referência da versão 0.21.0 em onze idiomas, com o nome atualizado para Browserland. Esses capítulos não descrevem integralmente a versão atual. Esta atualização prevalece nos pontos em que o funcionamento mudou.'),
            ('Um único botão Abrir', 'Chromium, Google Chrome e Microsoft Edge usam o mesmo botão Abrir. A navegação normal é a predefinição para novos perfis de navegador completo e perfis antigos sem um modo guardado. O motor integrado Electron continua no modo personalizado.'),
            ('Sessões e definições do perfil', 'A navegação normal utiliza uma sessão persistente própria, separada dos dados personalizados anteriores. Escolha Com definições do perfil no editor para voltar ao modo e aos dados originais. Idioma, fuso horário, identidade e alterações de APIs aplicam-se apenas no modo personalizado. O proxy configurado mantém-se no modo normal; credenciais de proxy geridas pela aplicação exigem o modo personalizado.'),
            ('Utilize a janela do navegador', 'Na navegação normal, gira separadores, histórico, favoritos, extensões e transferências no próprio navegador. Utilize Sair ou Quit antes de editar o perfil. As ações do gestor que exigem depuração e a transferência de sessões não estão disponíveis nesse modo.'),
            ('Instalar e atualizar', 'Windows: feche a aplicação e os perfis e execute Browserland-0.22.0-Windows-Setup.exe. O instalador deteta uma instalação EXE existente e conserva a pasta data. macOS: extraia o pacote completo, conserve a pasta data portátil e abra Browserland.app. As pastas de sessões existentes não são renomeadas nem copiadas automaticamente.'),
            ('Ficheiros e limites de validação', 'As novas exportações usam o nome e os formatos Browserland; os ficheiros antigos de configurações e sessões encriptadas continuam a ser aceites. O login Google na aplicação final, a execução num Mac real e a atualização/desinstalação através do instalador ainda exigem confirmação manual. O instalador Windows não está assinado e o pacote Mac não está notarizado.')]),
    ]
    normal = ParagraphStyle('body', fontName='Helvetica', fontSize=10.4, leading=14.2, textColor=HexColor('#293c52'))
    for language, title, version, sections in note_pages:
        pdf.setFillColor(HexColor('#142238')); pdf.rect(0, height-145, width, 145, fill=1, stroke=0)
        pdf.setFillColor(HexColor('#b3a4ff')); pdf.setFont('Helvetica-Bold', 11); pdf.drawString(48,height-39,language+' / CURRENT RELEASE UPDATE')
        pdf.setFillColor(HexColor('#ffffff')); pdf.setFont('Helvetica-Bold', 27); pdf.drawString(48,height-77,'Browserland')
        pdf.setFont('Helvetica', 17); pdf.drawString(48,height-107,title)
        pdf.setFont('Helvetica', 10); pdf.drawRightString(width-48,height-38,'0.22.0  |  03 NOV 2026')
        y=height-174
        for heading, body in sections:
            pdf.setFillColor(HexColor('#5b48b6')); pdf.setFont('Helvetica-Bold', 11.5);pdf.drawString(48,y,heading);y-=10
            paragraph=Paragraph(body,normal);_,h=paragraph.wrap(width-96,height)
            paragraph.drawOn(pdf,48,y-h);y-=h+21
        if y<42:raise ValueError('Update note overflows its page')
        pdf.setStrokeColor(HexColor('#dae1ec'));pdf.line(48,42,width-48,42)
        pdf.setFillColor(HexColor('#64748b'));pdf.setFont('Helvetica',8.5);pdf.drawString(48,27,'Antonio Fradique | '+version);pdf.drawRightString(width-48,27,'Update / Atualização '+language)
        pdf.showPage()
    pdf.save();output.seek(0);return PdfReader(output)


def render(pdf_path, destination, dll_path, pages):
    from PIL import Image
    dll=ctypes.CDLL(str(dll_path))
    dll.FPDF_InitLibrary()
    signatures={
        'FPDF_LoadDocument':([ctypes.c_char_p,ctypes.c_char_p],ctypes.c_void_p),
        'FPDF_LoadPage':([ctypes.c_void_p,ctypes.c_int],ctypes.c_void_p),
        'FPDF_GetPageWidth':([ctypes.c_void_p],ctypes.c_double),
        'FPDF_GetPageHeight':([ctypes.c_void_p],ctypes.c_double),
        'FPDFBitmap_Create':([ctypes.c_int,ctypes.c_int,ctypes.c_int],ctypes.c_void_p),
        'FPDFBitmap_FillRect':([ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_ulong],None),
        'FPDF_RenderPageBitmap':([ctypes.c_void_p,ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int],None),
        'FPDFBitmap_GetBuffer':([ctypes.c_void_p],ctypes.c_void_p),
        'FPDFBitmap_GetStride':([ctypes.c_void_p],ctypes.c_int),
        'FPDFBitmap_Destroy':([ctypes.c_void_p],None),
        'FPDF_ClosePage':([ctypes.c_void_p],None),
        'FPDF_CloseDocument':([ctypes.c_void_p],None),
    }
    for name,(args,result) in signatures.items():
        function=getattr(dll,name);function.argtypes=args;function.restype=result
    document=dll.FPDF_LoadDocument(str(pdf_path.resolve()).encode('utf-8'),None)
    if not document:raise RuntimeError('PDFium could not open the output PDF')
    destination.mkdir(parents=True,exist_ok=True)
    try:
        for number in pages:
            page=dll.FPDF_LoadPage(document,number);width=round(dll.FPDF_GetPageWidth(page)*1.5);height=round(dll.FPDF_GetPageHeight(page)*1.5)
            bitmap=dll.FPDFBitmap_Create(width,height,1)
            dll.FPDFBitmap_FillRect(bitmap,0,0,width,height,0xffffffff)
            dll.FPDF_RenderPageBitmap(bitmap,page,0,0,width,height,0,0)
            stride=dll.FPDFBitmap_GetStride(bitmap)
            data=ctypes.string_at(dll.FPDFBitmap_GetBuffer(bitmap),stride*height)
            Image.frombytes('RGBA',(width,height),data,'raw','BGRA',stride,1).convert('RGB').save(destination/f'page-{number+1:02}.png')
            dll.FPDFBitmap_Destroy(bitmap);dll.FPDF_ClosePage(page)
    finally:dll.FPDF_CloseDocument(document)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--pdfium',type=Path);parser.add_argument('--render-directory',type=Path)
    args=parser.parse_args();reader=PdfReader(args.source);writer=PdfWriter(clone_from=reader)
    cover_fonts=writer.pages[0]['/Resources']['/Font'];fallback_fonts={'bold':cover_fonts.raw_get('/F22'),'regular':cover_fonts.raw_get('/F25')}
    split_count=sum(rebrand_split_names(page,writer,fallback_fonts) for page in writer.pages)
    count=sum(rebrand_page(page,writer,fallback_fonts,cover=index==0) for index,page in enumerate(writer.pages))
    note=update_note((float(writer.pages[0].mediabox.width),float(writer.pages[0].mediabox.height)))
    for index,page in enumerate(note.pages):writer.insert_page(page,index)
    writer.set_page_label(0,1,style='/r');writer.set_page_label(2,len(writer.pages)-1,style='/D',start=1)
    metadata={str(key):str(value).replace('Multi-Browser','Browserland') for key,value in (reader.metadata or {}).items()}
    metadata.update({'/Title':'Browserland 0.22.0 - Multilingual reference guide with current-release update','/Creator':'Browserland documentation','/Subject':'Two-page English/Portuguese 0.22.0 update followed by the original eleven-language 0.21.0 reference chapters, rebranded without layout changes.','/ModDate':"D:20261103000000+00'00'"})
    writer.add_metadata(metadata)
    # Brand names may also occur in document structure/accessibility strings.
    for obj in writer._objects:
        if isinstance(obj,dict):
            for key,value in list(obj.items()):
                if isinstance(value,TextStringObject) and 'Multi-Browser' in value:
                    obj[key]=TextStringObject(value.replace('Multi-Browser','Browserland'))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('wb') as output:writer.write(output)
    check=PdfReader(args.output);text='\n'.join(page.extract_text() for page in check.pages)
    if len(check.pages)!=81 or re.search(r'Multi\s*[-\u2010\u2011\u2013]?\s*Browser',text,re.I):raise ValueError('Manual page count or branding validation failed')
    if args.pdfium:
        render(args.output,args.render_directory or args.output.parent/'manual-preview',args.pdfium,[0,1,2,3,4,11,18,25,31,32,38,39,46,52,53,59,60,67,74,80])
    print(json.dumps({'output':str(args.output),'pages':len(check.pages),'replacedBlocks':count,'splitNamesReplaced':split_count,'brandOccurrences':text.count('Browserland'),'originalReferenceVersion':'0.21.0','currentUpdateVersion':'0.22.0','pageLabels':check.page_labels[:5]}))


if __name__=='__main__':main()
