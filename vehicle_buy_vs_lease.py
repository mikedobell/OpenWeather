"""
Vehicle Purchase vs. Lease Analysis
Budget: $100,000 every 10 years
Equity return rate: ~10% annually
"""


def fmt(val):
    return f"${val:,.0f}"


def buy_scenario(name, purchase_price, annual_maintenance_increase=200,
                 base_maintenance=500, resale_pct=0.10):
    """Buy the car outright. Invest leftover budget in equities."""
    years = 10
    rate = 0.10
    leftover = 100_000 - purchase_price
    investment = leftover  # invested at year 0

    total_maintenance = 0
    for y in range(1, years + 1):
        total_maintenance += base_maintenance + annual_maintenance_increase * y

    # Leftover grows in equities for 10 years
    investment_value = investment * (1 + rate) ** years
    resale_value = purchase_price * resale_pct

    net_value = investment_value + resale_value - total_maintenance

    print(f"\n{'='*60}")
    print(f"  BUY SCENARIO: {name}")
    print(f"{'='*60}")
    print(f"  Purchase price:          {fmt(purchase_price)}")
    print(f"  Cash left over:          {fmt(leftover)}")
    print(f"  10-yr investment growth: {fmt(investment_value)} (from {fmt(leftover)})")
    print(f"  Total maintenance:       {fmt(total_maintenance)}")
    print(f"  Resale value ({resale_pct:.0%}):      {fmt(resale_value)}")
    print(f"  ─────────────────────────────────────")
    print(f"  NET POSITION after 10yr: {fmt(net_value)}")
    return net_value


def lease_scenario(name, monthly_payment, down_payment=3000,
                   lease_term_months=36, annual_maintenance=300):
    """Lease cars over 10 years, invest remaining budget in equities."""
    years = 10
    rate = 0.10
    monthly_rate = rate / 12

    total_lease_cost = 0
    investment_balance = 100_000 - down_payment  # invest the rest at month 0
    total_maintenance = 0

    # Simulate month by month
    month = 0
    leases_started = 0
    for m in range(1, years * 12 + 1):
        month += 1
        # Start a new lease every lease_term_months
        lease_month = (m - 1) % lease_term_months + 1
        if lease_month == 1 and m > 1:
            # New lease starts — another down payment
            investment_balance -= down_payment
            leases_started += 1

        # Monthly payment from investments
        investment_balance -= monthly_payment
        total_lease_cost += monthly_payment

        # Maintenance (simplified annual spread monthly)
        maint = annual_maintenance / 12
        investment_balance -= maint
        total_maintenance += maint

        # Investment growth
        investment_balance *= (1 + monthly_rate)

    total_down = down_payment * (1 + leases_started)
    total_lease_cost += total_down

    print(f"\n{'='*60}")
    print(f"  LEASE SCENARIO: {name}")
    print(f"{'='*60}")
    print(f"  Monthly payment:         {fmt(monthly_payment)}/mo")
    print(f"  Down payment per lease:  {fmt(down_payment)}")
    print(f"  Lease term:              {lease_term_months} months")
    print(f"  Number of leases:        {1 + leases_started}")
    print(f"  Total lease payments:    {fmt(total_lease_cost)}")
    print(f"  Total maintenance:       {fmt(total_maintenance)}")
    print(f"  ─────────────────────────────────────")
    print(f"  INVESTMENT BALANCE:      {fmt(investment_balance)}")
    print(f"  NET POSITION after 10yr: {fmt(investment_balance)}")
    return investment_balance


def main():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║     VEHICLE BUY vs. LEASE ANALYSIS — $100K / 10 YEARS      ║")
    print("║     Equity return assumption: 10% annually                  ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    results = {}

    # ── BUY SCENARIOS ──
    print("\n" + "▸" * 60)
    print("  BUY SCENARIOS")
    print("▸" * 60)

    results["Buy: Economy ($30K)"] = buy_scenario(
        "Economy Car ($30K)", 30_000, annual_maintenance_increase=150,
        base_maintenance=400, resale_pct=0.15)

    results["Buy: Mid-Range ($50K)"] = buy_scenario(
        "Mid-Range Car ($50K)", 50_000, annual_maintenance_increase=200,
        base_maintenance=500, resale_pct=0.12)

    results["Buy: Luxury ($75K)"] = buy_scenario(
        "Luxury Car ($75K)", 75_000, annual_maintenance_increase=300,
        base_maintenance=800, resale_pct=0.10)

    results["Buy: Full Budget ($100K)"] = buy_scenario(
        "Full Budget ($100K)", 100_000, annual_maintenance_increase=400,
        base_maintenance=1000, resale_pct=0.08)

    # ── LEASE SCENARIOS ──
    print("\n" + "▸" * 60)
    print("  LEASE SCENARIOS")
    print("▸" * 60)

    results["Lease: Economy ($300/mo)"] = lease_scenario(
        "Economy Lease ($300/mo)", 300, down_payment=2000,
        lease_term_months=36, annual_maintenance=200)

    results["Lease: Mid-Range ($500/mo)"] = lease_scenario(
        "Mid-Range Lease ($500/mo)", 500, down_payment=3000,
        lease_term_months=36, annual_maintenance=300)

    results["Lease: Luxury ($800/mo)"] = lease_scenario(
        "Luxury Lease ($800/mo)", 800, down_payment=5000,
        lease_term_months=36, annual_maintenance=200)

    results["Lease: Premium ($1200/mo)"] = lease_scenario(
        "Premium Lease ($1,200/mo)", 1200, down_payment=5000,
        lease_term_months=36, annual_maintenance=200)

    # ── COMPARISON ──
    print("\n")
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║                    SIDE-BY-SIDE SUMMARY                    ║")
    print("╠══════════════════════════════════════════════════════════════╣")
    sorted_results = sorted(results.items(), key=lambda x: x[1], reverse=True)
    for rank, (label, val) in enumerate(sorted_results, 1):
        marker = " ★ BEST" if rank == 1 else ""
        print(f"║  {rank}. {label:<35s} {fmt(val):>12s}{marker:<7s} ║")
    print("╚══════════════════════════════════════════════════════════════╝")

    best_label, best_val = sorted_results[0]
    worst_label, worst_val = sorted_results[-1]
    print(f"\n  Best outcome:  {best_label} → {fmt(best_val)}")
    print(f"  Worst outcome: {worst_label} → {fmt(worst_val)}")
    print(f"  Difference:    {fmt(best_val - worst_val)}")

    print("\n── KEY TAKEAWAYS ──")
    print("  • Buying a cheaper car and investing the rest tends to win")
    print("    because the large lump sum compounds for the full 10 years.")
    print("  • Leasing keeps more cash invested but drains it monthly,")
    print("    reducing compounding. Higher lease payments erode the edge.")
    print("  • The break-even depends heavily on the car price vs. lease cost.")
    print("  • Maintenance costs rise over time for owned cars, giving")
    print("    leasing a slight advantage on newer-car reliability.")
    print()


if __name__ == "__main__":
    main()
