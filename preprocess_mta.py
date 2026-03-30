import pandas as pd
from pathlib import Path

RAW_FILE = Path("data/mta_hourly_raw.csv")
OUTPUT_FILE = Path("data/station_hourly.csv")


def classify_day_type(ts: pd.Timestamp) -> str:
    weekday = ts.weekday()  # Monday=0, Sunday=6
    if weekday <= 4:
        return "Weekday"
    elif weekday == 5:
        return "Saturday"
    else:
        return "Sunday"


def main():
    print(f"Reading raw file: {RAW_FILE}")
    df = pd.read_csv(RAW_FILE)

    expected_cols = {
        "transit_timestamp",
        "transit_mode",
        "station_complex_id",
        "station_complex",
        "borough",
        "ridership",
        "latitude",
        "longitude",
    }

    missing = expected_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Keep subway only
    df = df[df["transit_mode"].astype(str).str.lower() == "subway"].copy()

    # Parse timestamp
    df["transit_timestamp"] = pd.to_datetime(df["transit_timestamp"], errors="coerce")
    df = df.dropna(subset=["transit_timestamp"])

    # Clean numeric columns
    df["ridership"] = pd.to_numeric(df["ridership"], errors="coerce").fillna(0)
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")

    # Drop bad coordinates
    df = df.dropna(subset=["latitude", "longitude"])

    # Derive hour + day type
    df["hour"] = df["transit_timestamp"].dt.hour
    df["day_type"] = df["transit_timestamp"].apply(classify_day_type)

    # Rename to match your D3 app
    df = df.rename(columns={
        "station_complex_id": "complex_id",
        "station_complex": "station_name",
        "latitude": "lat",
        "longitude": "lon",
    })

    # Aggregate ridership by station/day_type/hour/date first, then average across dates
    # This gives "typical ridership for this hour on this day type" regardless of
    # how many weekdays vs weekend days exist in the dataset.
    df["date"] = df["transit_timestamp"].dt.date

    per_day = (
        df.groupby(
            ["complex_id", "station_name", "borough", "lat", "lon", "day_type", "hour", "date"],
            as_index=False
        )["ridership"]
        .sum()
    )

    grouped = (
        per_day.groupby(
            ["complex_id", "station_name", "borough", "lat", "lon", "day_type", "hour"],
            as_index=False
        )["ridership"]
        .mean()
    )

    # Daily totals by station/day_type
    daily_totals = (
        grouped.groupby(["complex_id", "day_type"], as_index=False)["ridership"]
        .sum()
        .rename(columns={"ridership": "daily_total"})
    )

    # Peak hour by station/day_type
    peak_rows = (
        grouped.sort_values(
            ["complex_id", "day_type", "ridership", "hour"],
            ascending=[True, True, False, True]
        )
        .groupby(["complex_id", "day_type"], as_index=False)
        .first()[["complex_id", "day_type", "hour"]]
        .rename(columns={"hour": "peak_hour"})
    )

    # Merge totals + peak hour back in
    result = (
        grouped.merge(daily_totals, on=["complex_id", "day_type"], how="left")
               .merge(peak_rows, on=["complex_id", "day_type"], how="left")
    )

    # Reorder columns to match main.js expectations
    result = result[
        [
            "complex_id",
            "station_name",
            "borough",
            "lat",
            "lon",
            "day_type",
            "hour",
            "ridership",
            "peak_hour",
            "daily_total",
        ]
    ].sort_values(["complex_id", "day_type", "hour"])

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(OUTPUT_FILE, index=False)

    print(f"Done. Wrote {len(result):,} rows to {OUTPUT_FILE}")
    print(result.head(12).to_string(index=False))


if __name__ == "__main__":
    main()