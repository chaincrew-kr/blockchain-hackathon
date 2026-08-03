# Git 브랜치 운영

## 흐름

```text
feature/* ──PR──▶ dev ──release PR──▶ main
```

- `main`: 심사/데모 가능한 안정 버전
- `dev`: 팀 통합 브랜치
- `feature/*`, `fix/*`, `docs/*`, `chore/*`: 개인 작업 브랜치

원격 `dev` 브랜치를 처음 만든 직후 GitHub Ruleset을 활성화합니다. 실제 강제는
각 개발자의 로컬 훅보다 GitHub 규칙으로 단일화합니다.

## 작업 시작

```bash
git switch dev
git pull --ff-only origin dev
git switch -c feature/<scope>-<short-description>
```

PR 전에는 `npm run check`를 실행하고, 지갑 개인 키·시드 구문·`.env`를 커밋하지
않습니다. 커밋 접두사는 `feat:`, `fix:`, `docs:`, `chore:`, `test:`를 권장합니다.

## GitHub Ruleset

GitHub 저장소 Settings → Rules → Rulesets에서 `main`과 `dev`에 각각 다음 규칙을
활성화합니다.

### main

- Restrict deletions / block force pushes
- Require a pull request before merging
- Required approvals: 1
- Require conversation resolution
- Require status check: `check`
- Require branch to be up to date
- 허용 merge 방식: Squash merge
- PR base는 `dev`만 허용하는 팀 규칙

### dev

- Restrict deletions / block force pushes
- Require a pull request before merging
- Required approvals: 1
- Require conversation resolution
- Require status check: `check`

해커톤 4인 팀에서는 CODEOWNERS를 과도하게 세분화하면 병목이 생기므로, 각 PR을
본인 외 한 명이 검토하는 규칙이 적당합니다. 지갑/정산 코드 PR은 Blockchain 담당자,
배포 PR은 Backend/Cloud 담당자를 필수 리뷰어로 지정합니다.
