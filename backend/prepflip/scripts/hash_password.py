"""Create password hashes and accounts for users.json.

    npm run hash-password                          # print a hash for a password you type
    npm run hash-password -- --add asha --name "Asha K"   # add or update an account in users.json

Passwords are always typed at a hidden prompt, never passed on the command line.
"""

import argparse
import getpass
import json
import sys
import uuid
from pathlib import Path

from prepflip.config import Settings
from prepflip.services.auth import hash_password, normalise_username

MIN_LENGTH = 8


def ask_password() -> str:
    while True:
        password = getpass.getpass("Password: ")
        if len(password) < MIN_LENGTH:
            print(f"Use at least {MIN_LENGTH} characters.", file=sys.stderr)
            continue
        if getpass.getpass("Repeat password: ") != password:
            print("The passwords don't match. Try again.", file=sys.stderr)
            continue
        return password


def add_user(path: Path, username: str, display_name: str, password_hash: str) -> str:
    data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"users": []}
    users = data.setdefault("users", [])
    existing = next((u for u in users if normalise_username(u["username"]) == normalise_username(username)), None)
    if existing:
        existing["password_hash"] = password_hash
        existing["display_name"] = display_name or existing["display_name"]
        action = "Updated"
    else:
        users.append({
            "id": str(uuid.uuid4()),
            "username": username,
            "password_hash": password_hash,
            "display_name": display_name or username,
        })
        action = "Added"
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return action


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--add", metavar="USERNAME", help="add or update this account in the users file")
    parser.add_argument("--name", default="", help="display name for --add (defaults to the username)")
    parser.add_argument("--file", type=Path, default=Settings.from_env().users_file, help="users file for --add")
    args = parser.parse_args()

    password_hash = hash_password(ask_password())
    if args.add:
        action = add_user(args.file, args.add.strip(), args.name.strip(), password_hash)
        print(f"{action} {args.add!r} in {args.file}. Restart the server to apply it.")
    else:
        print(password_hash)


if __name__ == "__main__":
    main()
