# Healthcare No-Show Prediction Model

## Overview
Predicts whether a patient will miss an appointment using historical scheduling data.

## Objective
Reduce no-shows to improve clinic throughput and patient outcomes.

## Data
Public/synthetic data only. Typical fields: patient_id, appointment_date, lead_time_days, reminder_sent, weekday, weather, no_show (0/1).

## Methods
- Python (pandas, scikit-learn)
- Train/test split, baseline (logistic), tuned (random forest)
- Metrics: accuracy, precision/recall, ROC AUC

## Results (example)
- ROC AUC: 0.81
- Top drivers: reminder_sent, lead_time_days, weekday

## Artifacts
- `notebooks/`: EDA & modeling
- `data/`: sample dataset
- `visuals/`: charts and model outputs
