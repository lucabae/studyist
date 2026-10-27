"""Modo de envio de PDFs a OpenRouter: texto extraido (gratis) o archivo."""

from server.scripts import files as files_script
from server.scripts import openrouter


def _fake_pdf(monkeypatch, tmp_path, name="apuntes.pdf", content=b"%PDF-1.4 fake"):
    """Hace que resolve() devuelva un PDF de mentira en un directorio temporal."""
    path = tmp_path / name
    path.write_bytes(content)
    monkeypatch.setattr(files_script, "resolve", lambda _relative: path)
    return path


def test_pdf_text_mode_sends_extracted_text(monkeypatch, tmp_path):
    """Por defecto el PDF se convierte en texto: sin file processing."""
    _fake_pdf(monkeypatch, tmp_path)
    monkeypatch.setattr(files_script, "extract_text", lambda *_: "La derivada de x^2")

    parts = openrouter._encode_files(["pdfs/apuntes.pdf"])

    assert parts == [
        {
            "type": "text",
            "text": "Contenido de apuntes.pdf:\nLa derivada de x^2",
        }
    ]


def test_pdf_file_mode_sends_base64_file(monkeypatch, tmp_path):
    """Con file_mode "file" se manda el PDF original a OpenRouter."""
    _fake_pdf(monkeypatch, tmp_path, content=b"%PDF-1.4 hola")

    parts = openrouter._encode_files(["pdfs/apuntes.pdf"], "file")

    assert parts[0]["type"] == "file"
    assert parts[0]["file"]["filename"] == "apuntes.pdf"
    assert parts[0]["file"]["file_data"].startswith(
        "data:application/pdf;base64,"
    )


def test_pdf_text_mode_falls_back_to_file_without_text(monkeypatch, tmp_path):
    """Un PDF escaneado (sin capa de texto) se manda como archivo."""
    _fake_pdf(monkeypatch, tmp_path)
    monkeypatch.setattr(files_script, "extract_text", lambda *_: "   ")

    parts = openrouter._encode_files(["pdfs/apuntes.pdf"])

    assert parts[0]["type"] == "file"
