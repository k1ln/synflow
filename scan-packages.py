#!/usr/bin/env python3

import json
import sys
import urllib.request
import csv
from pathlib import Path
from typing import Dict, Set, Tuple

# Colors for output
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
NC = '\033[0m'  # No Color

CSV_URL = "https://raw.githubusercontent.com/wiz-sec-public/wiz-research-iocs/main/reports/shai-hulud-2-packages.csv"
CSV_FILE = "shai-hulud-2-packages.csv"
PACKAGE_JSON = "package.json"
PACKAGE_LOCK = "package-lock.json"


def download_csv(url=CSV_URL):
    """Download the latest infected packages CSV."""
    print("⬇️  Downloading latest infected packages list...")
    try:
        with urllib.request.urlopen(url) as response:
            content = response.read().decode('utf-8')
            with open(CSV_FILE, 'w') as f:
                f.write(content)
        print(f"{GREEN}✓{NC} Successfully downloaded CSV")
        return True
    except Exception as e:
        print(f"{RED}✗{NC} Failed to download CSV: {e}")
        return False


def load_infected_packages() -> Set[Tuple[str, str]]:
    """Load infected packages from CSV into a set for fast lookup."""
    infected = set()
    try:
        with open(CSV_FILE, 'r') as f:
            reader = csv.reader(f)
            next(reader)  # Skip header
            for row in reader:
                if len(row) >= 2:
                    package = row[0].strip()
                    version = row[1].strip().lstrip('= ')
                    infected.add((package, version))
        return infected
    except Exception as e:
        print(f"{RED}✗{NC} Failed to read CSV: {e}")
        sys.exit(1)


def load_package_json() -> Dict[str, str]:
    """Load and parse package.json."""
    if not Path(PACKAGE_JSON).exists():
        print(f"{RED}✗{NC} package.json not found in current directory")
        sys.exit(1)
    
    print(f"{GREEN}✓{NC} Found package.json")
    
    try:
        with open(PACKAGE_JSON, 'r') as f:
            pkg = json.load(f)
        
        # Collect all dependencies
        all_deps = {}
        for dep_type in ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']:
            if dep_type in pkg:
                all_deps.update(pkg[dep_type])
        
        # Clean version strings (remove ^, ~, >=, etc.)
        cleaned_deps = {}
        for name, version in all_deps.items():
            # Remove common version prefixes and take first part
            clean_version = version.lstrip('^~>=<').split()[0]
            cleaned_deps[name] = clean_version
        
        return cleaned_deps
    except Exception as e:
        print(f"{RED}✗{NC} Failed to parse package.json: {e}")
        sys.exit(1)


def load_package_lock() -> Dict[str, str]:
    """Load and parse package-lock.json to get all dependencies including transitive ones."""
    if not Path(PACKAGE_LOCK).exists():
        return {}
    
    print(f"{GREEN}✓{NC} Found package-lock.json")
    
    try:
        with open(PACKAGE_LOCK, 'r') as f:
            lock = json.load(f)
        
        all_packages = {}
        
        # Handle both lockfileVersion 1 and 2/3 formats
        if 'packages' in lock:
            # Version 2/3 format
            for package_path, package_info in lock.get('packages', {}).items():
                if package_path == '':  # Skip root package
                    continue
                
                # Extract package name from path (remove node_modules prefix)
                package_name = package_path.replace('node_modules/', '')
                
                # Handle scoped packages
                if package_name.startswith('@'):
                    parts = package_name.split('/')
                    if len(parts) >= 2:
                        # Keep scope and package name only
                        package_name = f"{parts[0]}/{parts[1]}"
                
                if 'version' in package_info:
                    all_packages[package_name] = package_info['version']
        
        if 'dependencies' in lock:
            # Version 1 format or additional dependencies
            def extract_deps(deps_dict):
                for name, info in deps_dict.items():
                    if isinstance(info, dict) and 'version' in info:
                        all_packages[name] = info['version']
                    if isinstance(info, dict) and 'dependencies' in info:
                        extract_deps(info['dependencies'])
            
            extract_deps(lock['dependencies'])
        
        return all_packages
    except Exception as e:
        print(f"{YELLOW}⚠{NC} Failed to parse package-lock.json: {e}")
        return {}


def scan_packages(installed: Dict[str, str], infected: Set[Tuple[str, str]]) -> list:
    """Scan installed packages against infected list."""
    found_infections = []
    
    for package_name, version in installed.items():
        if (package_name, version) in infected:
            found_infections.append((package_name, version))
    
    return found_infections


def main():
    print("=" * 51)
    print("  Shai-Hulud Package Scanner (Python)")
    print("=" * 51)
    print()
    
    # Check for test mode
    test_mode = '--test' in sys.argv
    
    if test_mode:
        print(f"{YELLOW}🧪 TEST MODE ENABLED{NC}")
        print("Using local test CSV file...")
        print()
        if not Path(CSV_FILE).exists():
            print(f"{RED}✗{NC} Test CSV not found. Creating test file...")
            print()
            print("Add a package from your package.json to the CSV for testing.")
            print("Example: react,19.1.1")
            sys.exit(1)
    else:
        # Download CSV
        if not download_csv():
            sys.exit(1)
    
    # Load package.json
    print()
    print("📦 Extracting dependencies from package.json...")
    installed_packages = load_package_json()
    total_deps = len(installed_packages)
    print(f"{GREEN}✓{NC} Found {total_deps} packages in package.json")
    
    # Load package-lock.json if it exists
    print()
    print("🔒 Checking for package-lock.json...")
    lock_packages = load_package_lock()
    if lock_packages:
        print(f"{GREEN}✓{NC} Found {len(lock_packages)} packages in package-lock.json (including transitive dependencies)")
        # Merge lock packages into installed packages
        for name, version in lock_packages.items():
            if name not in installed_packages:
                installed_packages[name] = version
        total_with_lock = len(installed_packages)
        print(f"{GREEN}✓{NC} Total unique packages to scan: {total_with_lock}")
    else:
        print(f"{YELLOW}⚠{NC} No package-lock.json found, scanning package.json only")
    
    # Load infected packages list
    infected_packages = load_infected_packages()
    print(f"{GREEN}✓{NC} Loaded {len(infected_packages)} infected package entries")
    
    # Scan for infections
    print()
    print("🔍 Scanning for infected packages...")
    print()
    
    infections = scan_packages(installed_packages, infected_packages)
    
    # Display results
    if infections:
        for package, version in infections:
            print(f"{RED}⚠️  INFECTED PACKAGE FOUND:{NC} {package}@{version}")
    
    print()
    print("=" * 51)
    print("  Scan Results")
    print("=" * 51)
    
    if not infections:
        print(f"{GREEN}✓ No infected packages found!{NC}")
        print("Your dependencies appear to be safe.")
    else:
        print(f"{RED}✗ Found {len(infections)} infected package(s)!{NC}")
        print()
        print("IMMEDIATE ACTIONS REQUIRED:")
        print("1. Do NOT run any scripts or code from these packages")
        print("2. Remove these packages immediately")
        print("3. Review your system for potential compromises")
        print("4. Rotate any credentials that may have been exposed")
        print()
        print("Infected packages:")
        for package, version in infections:
            print(f"{RED}  • {package}@{version}{NC}")
        print()
        sys.exit(1)
    
    print()
    print("=" * 51)


if __name__ == "__main__":
    main()
