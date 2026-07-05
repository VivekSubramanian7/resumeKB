"""Smoke test for LinkedIn export parser."""

from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path

from profile_ingest import linkedin_to_entries, parse_linkedin_export


def main() -> None:
    p = Path(tempfile.mkdtemp()) / "x.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr(
            "Profile.csv",
            "First Name,Last Name,Headline,Summary\nVivek,Subramanian,Engineer,Builds.\n",
        )
        z.writestr("Skills.csv", "Name\nGo\n")
    prof = parse_linkedin_export(p)
    assert prof.name == "Vivek Subramanian" and prof.skills == ["Go"]
    es = linkedin_to_entries(prof)
    assert {"person-vivek-subramanian", "skill-go"} <= {e.slug for e in es}
    print("linkedin-ok")


if __name__ == "__main__":
    main()
