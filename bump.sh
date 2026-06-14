set -e && cd `pwd`

# Self-heal: if this version is already on npm (a prior run published but failed
# before committing the version bump), skip publish instead of aborting on the
# "cannot publish over previously published versions" error.
if npm view "$npm_package_name@$npm_package_version" version > /dev/null 2>&1; then
  echo "[bump] $npm_package_version already published, skipping publish + tag"
else
  yarn publish . --non-interactive --tag latest
  git tag $npm_package_version
  git push origin --tags
fi

yarn version --patch
readonly VERSION=$(< package.json grep version \
  | head -1 \
  | awk -F: '{ print $2 }' \
  | sed 's/[",]//g' \
  | tr -d '[:space:]')
git commit --amend -m "^ pkg bump ($VERSION) [skip-ci]" 
git push origin

echo \"Successfully released version $npm_package_version!\"