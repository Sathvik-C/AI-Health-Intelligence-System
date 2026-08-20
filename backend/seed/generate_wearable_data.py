from datetime import date, timedelta
import random
import sys
from pathlib import Path

# Allow imports from backend/app
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BACKEND_DIR))

from app.database import SessionLocal
from app.models.models import User, WearableDaily


START_DATE = date(2026, 5, 23)
END_DATE = date(2026, 8, 20)

random.seed(42)


def clamp(value, minimum, maximum):
    return max(minimum, min(value, maximum))


def generate_wearable_data():
    rows = []

    current_date = START_DATE
    day_index = 0

    activity_types = [
        "Walking",
        "Running",
        "Cycling",
        "Gym",
        "Yoga",
        "Rest",
    ]

    total_days = (END_DATE - START_DATE).days + 1

    while current_date <= END_DATE:

        # Weekends have slightly lower activity.
        weekend_factor = (
            0.82
            if current_date.weekday() >= 5
            else 1.0
        )

        # Create three realistic periods:
        # 1. Normal
        # 2. Reduced activity / sleep
        # 3. Recovery
        if day_index < 40:
            phase = 1.00

        elif day_index < 58:
            phase = 0.78

        else:
            recovery_progress = (
                (day_index - 58)
                / (total_days - 58)
            )

            phase = 0.78 + recovery_progress * 0.22

        # -------------------------
        # Activity
        # -------------------------

        steps = int(
            clamp(
                random.gauss(
                    8200 * phase * weekend_factor,
                    1150
                ),
                3500,
                12500
            )
        )

        distance_km = round(
            max(
                steps * random.gauss(
                    0.00074,
                    0.00004
                ),
                2.0
            ),
            2
        )

        active_minutes = int(
            clamp(
                random.gauss(
                    52 * phase * weekend_factor,
                    10
                ),
                20,
                100
            )
        )

        calories_burned = int(
            clamp(
                1750
                + steps * random.gauss(
                    0.045,
                    0.004
                )
                + active_minutes * 3.2,
                1750,
                2900
            )
        )

        # -------------------------
        # Sleep
        # -------------------------

        if day_index < 40:
            sleep_base = 7.35

        elif day_index < 58:
            sleep_base = 6.55

        else:
            sleep_base = 7.15

        sleep_hours = round(
            clamp(
                random.gauss(
                    sleep_base,
                    0.45
                ),
                5.3,
                9.0
            ),
            2
        )

        deep_sleep_hours = round(
            sleep_hours * random.uniform(
                0.16,
                0.24
            ),
            2
        )

        rem_sleep_hours = round(
            sleep_hours * random.uniform(
                0.18,
                0.25
            ),
            2
        )

        light_sleep_hours = round(
            max(
                sleep_hours
                - deep_sleep_hours
                - rem_sleep_hours,
                0
            ),
            2
        )

        # -------------------------
        # Heart Rate
        # -------------------------

        if day_index < 40:
            resting_hr_base = 67

        elif day_index < 58:
            resting_hr_base = 74

        else:
            resting_hr_base = 69

        resting_heart_rate = int(
            clamp(
                random.gauss(
                    resting_hr_base,
                    2.5
                ),
                60,
                82
            )
        )

        average_heart_rate = int(
            clamp(
                resting_heart_rate
                + random.gauss(7, 2),
                resting_heart_rate + 3,
                90
            )
        )

        max_heart_rate = int(
            clamp(
                average_heart_rate
                + random.gauss(
                    42
                    if active_minutes > 40
                    else 28,
                    7
                ),
                average_heart_rate + 15,
                175
            )
        )

        # -------------------------
        # Exercise
        # -------------------------

        if active_minutes < 28:

            activity_type = "Rest"

            exercise_minutes = random.randint(
                0,
                15
            )

        else:

            activity_type = random.choices(
                activity_types[:-1],
                weights=[
                    38,
                    16,
                    12,
                    24,
                    10
                ],
                k=1
            )[0]

            exercise_minutes = int(
                clamp(
                    random.gauss(
                        active_minutes * 0.65,
                        8
                    ),
                    15,
                    min(
                        90,
                        active_minutes
                    )
                )
            )

        exercise_calories = int(
            clamp(
                exercise_minutes
                * random.gauss(
                    7.2,
                    0.8
                ),
                80,
                700
            )
        )

        rows.append(
            {
                "date": current_date,
                "steps": steps,
                "distance_km": distance_km,
                "active_minutes": active_minutes,
                "calories_burned": calories_burned,

                "sleep_hours": sleep_hours,
                "deep_sleep_hours": deep_sleep_hours,
                "light_sleep_hours": light_sleep_hours,
                "rem_sleep_hours": rem_sleep_hours,

                "resting_heart_rate": resting_heart_rate,
                "average_heart_rate": average_heart_rate,
                "max_heart_rate": max_heart_rate,

                "activity_type": activity_type,
                "exercise_minutes": exercise_minutes,
                "exercise_calories": exercise_calories,
            }
        )

        current_date += timedelta(days=1)
        day_index += 1

    return rows


def seed_database():

    db = SessionLocal()

    try:

        # Get the first registered user.
        user = db.query(User).order_by(User.id.asc()).first()

        if not user:
            print(
                "ERROR: No users found in the database."
            )
            print(
                "Create/register a user first, "
                "then run this script again."
            )
            return

        print(
            f"Using user: {user.email} "
            f"(ID: {user.id})"
        )

        # Remove existing wearable records for this user.
        existing_count = (
            db.query(WearableDaily)
            .filter(
                WearableDaily.user_id == user.id
            )
            .count()
        )

        if existing_count > 0:

            print(
                f"Removing {existing_count} "
                "existing wearable records..."
            )

            (
                db.query(WearableDaily)
                .filter(
                    WearableDaily.user_id == user.id
                )
                .delete(
                    synchronize_session=False
                )
            )

            db.commit()

        # Generate records.
        rows = generate_wearable_data()

        # Convert dictionaries into SQLAlchemy objects.
        wearable_records = [
            WearableDaily(
                user_id=user.id,
                **row
            )
            for row in rows
        ]

        db.add_all(wearable_records)
        db.commit()

        print()
        print("=" * 50)
        print("WEARABLE DATA SEEDED SUCCESSFULLY")
        print("=" * 50)
        print(f"User ID:       {user.id}")
        print(f"Records:       {len(wearable_records)}")
        print(f"Start date:    {START_DATE}")
        print(f"End date:      {END_DATE}")
        print("=" * 50)

    except Exception as e:

        db.rollback()

        print(
            "ERROR while inserting wearable data:"
        )
        print(e)

        raise

    finally:

        db.close()


if __name__ == "__main__":
    seed_database()