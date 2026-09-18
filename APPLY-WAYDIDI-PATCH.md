# Waydidi orange-dot animation patch

Target repository: `waydidi/website`

Base branch: `main`

Base commit: `7c0bbeb213a45d790d9ea56e0007f8dcba17aa79`

## Apply locally

```bash
git switch main
git pull --ff-only
git apply --check waydidi-orange-dot-animation.patch
git apply waydidi-orange-dot-animation.patch
git add app/page.tsx app/globals.css
git commit -m "Add smooth orange dot intro animation"
git push origin main
```

The animation begins as a 24 px orange dot, expands to cover every viewport in 500 ms, and is disabled when the visitor prefers reduced motion.
