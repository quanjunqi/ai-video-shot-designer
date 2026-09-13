#!/usr/bin/env python3
"""Regression tests for the zero-dependency H3 mechanical validator."""

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "validate_h3_prompt.py"
spec = importlib.util.spec_from_file_location("validate_h3_prompt", SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


VALID = """```text
subject_definitions:
<Subject 1> is a person.
summary:
[reference generation] A 5-second shot.
retention_analysis:
<Subject 1> ([Shot 1]): fully_preserved.
detailed_description:
[Shot 1] At 00:00.000, <Subject 1> stands still.
overall_soundscape:
Room tone.
non_diegetic_music:
N/A
```"""


class ValidatorRegressionTests(unittest.TestCase):
    def test_valid_block_passes(self):
        issues, blocks = validator.validate_text(VALID, 15.0)
        self.assertEqual(blocks, 1)
        self.assertFalse([i for i in issues if i[0] == "ERROR"])

    def test_concise_definition_form_is_accepted(self):
        concise = VALID.replace("<Subject 1> is a person.", "<Subject 1> a person.")
        issues, blocks = validator.validate_text(concise, 15.0)
        self.assertEqual(blocks, 1)
        self.assertFalse([i for i in issues if i[0] == "ERROR"])

    def test_global_shot_numbers_are_allowed(self):
        global_numbers = VALID.replace("[Shot 1]", "[Shot 12]")
        issues, _ = validator.validate_text(global_numbers, 15.0)
        self.assertFalse(any(code == "ERROR" and "shot-order" in msg for code, msg in issues))

    def test_duplicate_shot_number_is_error(self):
        duplicate = VALID.replace(
            "[Shot 1] At 00:00.000, <Subject 1> stands still.",
            "[Shot 1] At 00:00.000, <Subject 1> stands still. [Shot 1] At 00:02.000, <Subject 1> sits.",
        )
        issues, _ = validator.validate_text(duplicate, 15.0)
        self.assertTrue(any(code == "ERROR" and "shot-order" in msg for code, msg in issues))

    def test_marked_baseline_is_ignored(self):
        text = "<!-- h3-validator: ignore -->\n```text\n" + VALID.split("\n", 1)[1]
        # Close the nested source fence explicitly; the ignored block must not count.
        text += "\n"
        issues, blocks = validator.validate_text(text, 15.0)
        self.assertEqual(blocks, 0)
        self.assertFalse([i for i in issues if i[0] == "ERROR"])

    def test_unknown_field_is_error(self):
        block = VALID.replace("summary:\n", "unexpected:\nvalue\nsummary:\n")
        issues, _ = validator.validate_text(block, 15.0)
        self.assertTrue(any(code == "ERROR" and "unknown-field" in msg for code, msg in issues))

    def test_undefined_tag_is_error(self):
        block = VALID.replace("<Subject 1> stands", "<Subject 2> stands")
        issues, _ = validator.validate_text(block, 15.0)
        self.assertTrue(any(code == "ERROR" and "tag-undefined" in msg for code, msg in issues))

    def test_unclosed_dialogue_is_error(self):
        block = VALID.replace("stands still.", "says <d>[Chinese] stop")
        issues, _ = validator.validate_text(block, 15.0)
        self.assertTrue(any(code == "ERROR" and "dialogue-unbalanced" in msg for code, msg in issues))

    def test_malformed_official_tag_is_error(self):
        block = VALID.replace("<Subject 1>", "<Subject1>")
        issues, _ = validator.validate_text(block, 15.0)
        self.assertTrue(any(code == "ERROR" and "malformed-tag" in msg for code, msg in issues))

    def test_extra_dialogue_close_is_error(self):
        block = VALID.replace("<Subject 1> stands still.", "<Subject 1> stands still. </d>")
        issues, _ = validator.validate_text(block, 15.0)
        self.assertTrue(any(code == "ERROR" and "dialogue-unbalanced" in msg for code, msg in issues))


if __name__ == "__main__":
    unittest.main()
