from pathlib import Path

from huggingface_hub import hf_hub_download


MODEL_REPOSITORY = "fmenegui/pretrained_image_ecg_doc"
MODEL_REVISION = "8669f2e6b6ad355c5a793a2298b74d9cace3248e"
MODEL_FILENAME = "model_fold0.ckpt"
MODEL_DIRECTORY = Path(__file__).resolve().parent / "ml_weights" / "ecg"
CHECKPOINT_PATH = MODEL_DIRECTORY / MODEL_FILENAME


def main() -> None:
    if CHECKPOINT_PATH.is_file():
        print(f"ECG model checkpoint already exists: {CHECKPOINT_PATH}")
        return

    checkpoint_path = hf_hub_download(
        repo_id=MODEL_REPOSITORY,
        filename=MODEL_FILENAME,
        revision=MODEL_REVISION,
        local_dir=MODEL_DIRECTORY,
    )
    print(f"Downloaded ECG model checkpoint to: {checkpoint_path}")


if __name__ == "__main__":
    main()
