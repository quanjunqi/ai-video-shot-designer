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
        init_sql = (COMPOSE_DIR / "postgres/init/001-databases.sql").read_text()
        # 四个集成测试库必须都在：它们与根目录 .env.example 的 *_TEST_DATABASE_URL 一一对应。
        # 此前只建了 production_test ⇒ 另外三个服务的集成测试在本地【静默跳过】，
        # 而预检需要它们真的跑起来才有意义。
        for db in ("production_test", "execution_test", "workspace_test", "asset_test"):
            self.assertIn(db, init_sql)
        self.assertEqual(services["production-test"]["profiles"], ["test"])


if __name__ == "__main__":
    unittest.main()
