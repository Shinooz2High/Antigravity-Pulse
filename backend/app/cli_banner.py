"""Terminal startup banner and QR code printer for start.ps1."""

from __future__ import annotations

import argparse
import sys

import qrcode

from .config import AppConfig
from .services.settings_service import SettingsService
from .utils import get_lan_ip, get_tailscale_ip


def _configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _print_qr(url: str) -> None:
    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make(fit=True)
    try:
        qr.print_ascii(invert=True)
    except UnicodeEncodeError:
        matrix = qr.get_matrix()
        for row in matrix:
            print("".join("  " if cell else "##" for cell in row))


def main() -> None:
    _configure_stdout()

    parser = argparse.ArgumentParser(description="Print Antigravity Pulse pairing info and QR code.")
    parser.add_argument("--tunnel-url", default=None, help="Optional remote tunnel base URL.")
    parser.add_argument("--short-url", default=None, help="Optional short memorable redirect URL.")
    args = parser.parse_args()

    cfg = AppConfig()
    settings = SettingsService(cfg)
    pin = settings.get_pin()
    pair_token = settings.get_pair_token()

    if args.tunnel_url:
        base_url = args.tunnel_url.rstrip("/")
        pair_url = f"{base_url}/?pair={pair_token}"
        if args.short_url:
            print(f"Short URL    : {args.short_url.strip()}")
        print(f"Tunnel URL   : {base_url}")
        print(f"Tunnel Pair  : {pair_url}")
        print("\nScan QR code for remote access (4G/5G):")
        _print_qr(pair_url)
        return

    lan_ip = get_lan_ip()
    ts_ip = get_tailscale_ip()
    local_url = f"http://127.0.0.1:{cfg.agy_port}"
    lan_url = f"http://{lan_ip}:{cfg.agy_port}"
    pair_url = f"{lan_url}/?pair={pair_token}"

    print(f"Local URL    : {local_url}")
    print(f"LAN URL      : {lan_url}")
    if ts_ip:
        print(f"Tailscale URL: http://{ts_ip}:{cfg.agy_port}")
    print(f"PIN          : {pin}")
    print(f"Pairing URL  : {pair_url}")
    print("\nScan QR code on your mobile phone (same Wi-Fi):")
    _print_qr(pair_url)


if __name__ == "__main__":
    main()
