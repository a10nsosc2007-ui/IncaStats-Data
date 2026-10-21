# Pruebas locales con carpeta temporal: NO utilizan bases reales ni la red.
import json
import tempfile
import unittest
from pathlib import Path

import inca_master_updater as m


class IncaUpdaterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="incastats_updater_test_")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "IncaStats-Data"
        self.root.mkdir()
        (self.root / ".git").mkdir()
        self.master = self.root / "INCA_BASE_MAESTRA"
        self.master.mkdir()
        self.delta = self.root / "NUEVO_LOTE"
        self.delta.mkdir()
        self.native = self.root / "TITAN_ALONSINHO_V1_GITHUB_READY"
        (self.native / "manifest").mkdir(parents=True)
        (self.native / "manifest/teams.json").write_text('{"teams":[]}', encoding="utf-8")
        self._set("ROOT", self.root)
        self._set("MASTER", self.master)
        self._set("TITAN", self.native)
        self._set("TEAM_CATALOG", self.master / "BASE_EQUIPOS_MASTER.json")
        self._set("PLAYER_CATALOG", self.master / "BASE_JUGADORES_MASTER.json")
        self._set("NATIVE_TEAMS", self.native / "manifest/teams.json")
        self._set("NATIVE_PLAYER_FILES", [
            self.root / "TITAN_PLAYERS_MASTER_2025_PLUS/MASTER/PLAYER_MATCH_STATS_2025_PLUS.csv",
            self.root / "TITAN_PLAYERS_CURRENT/MASTER/PLAYER_MATCH_STATS_CURRENT_EXTENDED.csv",
        ])
        self._set("NATIVE_REF_MATCHES", self.root / "TITAN_REFEREES_CURRENT/matches_master.csv")
        self._set("NATIVE_REF_INDEX", self.root / "TITAN_REFEREES_CURRENT/referees_master.csv")
        self._set("NEW_PLAYER_STATS", self.master / "JUGADORES/ESTADISTICAS/DELTA_PARTIDOS.csv")
        self._set("NEW_REF_MATCHES", self.master / "ARBITROS/DELTA_PARTIDOS.csv")
        self._set("NEW_REF_INDEX", self.master / "ARBITROS/DELTA_ARBITROS.csv")
        m.TEAM_CATALOG.write_text(json.dumps({
            "schema": "incastats.master.teams.v1",
            "count": 1, "teams": [{"team_id": 99, "name": "Club anterior", "country": "Peru"}]
        }), encoding="utf-8")
        m.PLAYER_CATALOG.write_text(json.dumps({
            "schema": "incastats.master.players.v1",
            "count": 1, "players": [{
                "id": "20", "name": "Jugador anterior", "last_date": "2026-10-12",
                "team_id": "99", "team": "Club anterior"
            }]
        }), encoding="utf-8")

    def _set(self, key, value):
        old = getattr(m, key)
        setattr(m, key, value)
        self.addCleanup(setattr, m, key, old)

    def put(self, path, content):
        p = self.delta / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

    def test_equipo_nuevo_estadisticas_y_segunda_corrida_sin_cambios(self):
        self.put("teams.json", json.dumps({"teams": [{
            "team_id": 100, "name": "Nuevo Club", "country": "Peru"
        }]}))
        self.put("stats/100_nuevo.csv",
                 "Event_ID,Team_ID,Tiempo,Goals\n111,100,ALL,2\n111,100,1ST,1\n")
        p, n = m.build_plan("equipos", self.delta)
        self.assertEqual(n, 2)
        self.assertGreaterEqual(len(p.data), 2)
        p.execute()
        self.assertEqual(m.read_json_file(m.TEAM_CATALOG)["count"], 2)
        self.assertTrue((self.master / "EQUIPOS/STATS/100.csv").is_file())
        second, _ = m.build_plan("equipos", self.delta)
        self.assertEqual(second.data, {})

    def test_jugador_fechas_viejas_no_sobrescriben_equipo_nuevo(self):
        self.put("players.json", json.dumps({"players": [{
            "id": "20", "name": "Jugador anterior",
            "team_id": "98", "team": "Club viejo", "last_date": "2026-09-01"
        }]}))
        plan, _ = m.build_plan("jugadores", self.delta)
        self.assertEqual(plan.data, {})
        new = m.read_json_file(m.PLAYER_CATALOG)["players"][0]
        self.assertEqual(new["team_id"], "99")

    def test_stats_player_nuevo_sin_duplicar_nativo(self):
        native = m.NATIVE_PLAYER_FILES[0]
        native.parent.mkdir(parents=True, exist_ok=True)
        native.write_text("Event_ID,ID_Jugador\n123,20\n", encoding="utf-8")
        self.put("player_match_stats.csv",
                 "Event_ID,Player_ID,Goles\n123,20,0\n124,20,1\n")
        plan, _ = m.build_plan("jugadores", self.delta)
        self.assertIn(m.NEW_PLAYER_STATS, plan.data)
        plan.execute()
        _, rows = m.read_csv_file(m.NEW_PLAYER_STATS)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Event_ID"], "124")
        plan_again, _ = m.build_plan("jugadores", self.delta)
        self.assertEqual(plan_again.data, {})


if __name__ == "__main__":
    unittest.main()
