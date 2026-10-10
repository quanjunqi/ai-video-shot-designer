"""Static guardrails for the local container deployment (not a Docker smoke test)."""

from pathlib import Path
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
COMPOSE_DIR = ROOT / "deploy" / "local"


class LocalComposeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = yaml.safe_load((COMPOSE_DIR / "compose.yaml").read_text())

    def test_every_service_has_a_container_source(self):
        for name, service in self.config["services"].items():
            with self.subTest(service=name):
                self.assertTrue("image" in service or "build" in service)
                if "build" in service:
                    context = (COMPOSE_DIR / service["build"]["context"]).resolve()
                    self.assertTrue((context / service["build"]["dockerfile"]).is_file())

    def test_host_ports_are_loopback_only(self):
        for name, service in self.config["services"].items():
            for port in service.get("ports", []):
                with self.subTest(service=name, port=port):
                    self.assertTrue(port.startswith("127.0.0.1:"))
        self.assertNotIn("ports", self.config["services"]["production"])

    def test_existing_app_is_health_checked_and_migrated(self):
        services = self.config["services"]
        for name in ("postgres", "redis", "production", "web"):
            with self.subTest(service=name):
                self.assertIn("healthcheck", services[name])
        self.assertEqual(
            services["production"]["depends_on"]["production-migrate"]["condition"],
            "service_completed_successfully",
        )
        self.assertEqual(
            services["production-migrate"]["depends_on"]["postgres"]["condition"],
            "service_healthy",
        )
        self.assertIn("production_test", (COMPOSE_DIR / "postgres/init/001-databases.sql").read_text())
        self.assertEqual(services["production-test"]["profiles"], ["test"])


if __name__ == "__main__":
    unittest.main()
