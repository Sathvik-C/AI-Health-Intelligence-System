"""Health Logs accept only the four types the analysis uses."""
import os
import sys

import pytest
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.logs import LogCreate  # noqa: E402


@pytest.mark.parametrize("t", ["blood_pressure", "glucose", "weight", "pulse"])
def test_supported_types(t):
    assert LogCreate(log_type=t, value=1).log_type == t


@pytest.mark.parametrize("t", ["spo2", "temperature", "sleep", "steps", "water", ""])
def test_dropped_types_rejected(t):
    with pytest.raises(ValidationError):
        LogCreate(log_type=t, value=1)
