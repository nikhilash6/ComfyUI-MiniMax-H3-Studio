from unittest.mock import patch
from h3studio.face_refine.setup import (
    get_face_refine_readiness,
    install_face_refine,
)

def test_face_refine_readiness_structure():
    status = get_face_refine_readiness()
    assert isinstance(status, dict)
    assert 'ok' in status
    assert 'yolo_backend' in status
    assert 'yolo_model' in status
    assert 'sam_backend' in status
    assert 'sam_model' in status
    assert 'yolo_ready' in status
    assert 'sam_ready' in status
    assert 'overall_ready' in status
    assert status['overall_ready'] == status['yolo_ready']

def test_install_face_refine_idempotent_when_already_installed(tmp_path):
    with patch('h3studio.face_refine.setup._models_path', return_value=tmp_path / 'models'),          patch('h3studio.face_refine.setup._custom_nodes_path', return_value=tmp_path / 'custom_nodes'),          patch('h3studio.face_refine.setup._check_ultralytics_pip', return_value=True),          patch('h3studio.face_refine.setup._download_file') as mock_dl:

        yolo_dir = tmp_path / 'models' / 'ultralytics' / 'bbox'
        yolo_dir.mkdir(parents=True, exist_ok=True)
        fake_yolo = yolo_dir / 'face_yolov8m.pt'
        fake_yolo.write_bytes(b'0' * (1024 * 1024 * 2))

        subpack_dir = tmp_path / 'custom_nodes' / 'ComfyUI-Impact-Subpack'
        subpack_dir.mkdir(parents=True, exist_ok=True)

        result = install_face_refine(
            install_yolo=True,
            install_subpack=True,
            install_pip_ultralytics=True,
            install_sam=False,
        )

        assert result['ok'] is True
        assert mock_dl.call_count == 0
        assert result['readiness']['yolo_ready'] is True
        assert any('already present' in a for a in result['actions'])

def test_install_face_refine_downloads_missing_models(tmp_path):
    with patch('h3studio.face_refine.setup._models_path', return_value=tmp_path / 'models'),          patch('h3studio.face_refine.setup._custom_nodes_path', return_value=tmp_path / 'custom_nodes'),          patch('h3studio.face_refine.setup._check_ultralytics_pip', return_value=True),          patch('h3studio.face_refine.setup._download_file') as mock_dl:

        result = install_face_refine(
            install_yolo=True,
            install_subpack=False,
            install_pip_ultralytics=False,
            install_sam=True,
        )

        assert result['ok'] is True
        assert mock_dl.call_count == 2
