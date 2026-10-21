"""Full pipeline: tracking -> features -> xYards -> ghost yards -> web/public/data.json."""
from src import extract, features, model, ghost_yards, export


def run():
    for step in (extract, features, model, ghost_yards, export):
        step.run()


if __name__ == "__main__":
    run()
